import json
import os
import uuid
import tempfile
import zipfile
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.contrib.gis.geos import GEOSGeometry, Polygon
from django.contrib.gis.serializers.geojson import Serializer as GeoJSONSerializer
from django.db import DatabaseError, connection
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_GET, require_POST

from django.conf import settings
from django.db import DatabaseError, transaction

from .models import GeoDataset, MapFeature


def map_view(request):
    supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    return render(request, "maps/map.html", {"supabase_url": supabase_url})


@require_GET
def carto_voyager_tile(request, variant, z, x, y):
    """Proxy CARTO raster tiles so its API key stays on the server."""
    if variant not in {"voyager", "voyager_nolabels"}:
        return HttpResponse(status=404)
    api_key = os.getenv("CARTO_API_KEY", "").strip()
    if not api_key:
        return JsonResponse({"error": "CARTO_API_KEY is not configured on the server."}, status=503)
    if z > 22 or x >= 2 ** z or y >= 2 ** z:
        return HttpResponse(status=404)

    tile_url = f"https://basemaps.cartocdn.com/rastertiles/{variant}/{z}/{x}/{y}.png"
    request_obj = Request(f"{tile_url}?key={api_key}", headers={"User-Agent": "ProjectWEBGIS/1.0"})
    try:
        with urlopen(request_obj, timeout=15) as response:
            tile = response.read(2_000_001)
            if len(tile) > 2_000_000:
                return JsonResponse({"error": "The basemap tile response was too large."}, status=502)
            content_type = response.headers.get("Content-Type", "image/png")
            if not content_type.startswith("image/"):
                return JsonResponse({"error": "CARTO returned an invalid tile response."}, status=502)
            result = HttpResponse(tile, content_type=content_type)
            result["Cache-Control"] = "public, max-age=86400"
            return result
    except HTTPError as exc:
        return JsonResponse({"error": "CARTO rejected the basemap tile request."}, status=502)
    except (TimeoutError, URLError, OSError):
        return JsonResponse({"error": "Could not reach CARTO to load the basemap tile."}, status=502)


@login_required(login_url="/admin/login/")
def data_manager(request):
    return render(request, "maps/data_manager.html")


def datasets_api(request):
    if request.method == "POST":
        if not request.user.is_authenticated or not request.user.is_staff:
            return JsonResponse({"error": "Sign in as a staff user to upload datasets."}, status=403)
        name = request.POST.get("name", "").strip()
        category = request.POST.get("category", "")
        upload = request.FILES.get("file")
        if not name or len(name) > 160 or not upload:
            return JsonResponse({"error": "Enter a dataset name and choose a file."}, status=400)
        if upload.size > 500 * 1024 * 1024:
            return JsonResponse({"error": "Dataset files must be 500 MB or smaller."}, status=413)
        suffix = Path(upload.name).suffix.lower()
        if category == GeoDataset.VECTOR and suffix not in {".zip", ".geojson", ".json"}:
            return JsonResponse({"error": "Vector datasets must be .zip or .geojson files."}, status=400)
        if category == GeoDataset.RASTER and suffix not in {".tif", ".tiff"}:
            return JsonResponse({"error": "Raster datasets must be .tif or .tiff files."}, status=400)
        try:
            dataset = _save_dataset(name, category, upload)
        except (ValueError, OSError, RuntimeError) as exc:
            return JsonResponse({"error": str(exc)}, status=400)
        return JsonResponse(_dataset_json(dataset), status=201)

    result = []
    try:
        for dataset in GeoDataset.objects.all():
            item = _dataset_json(dataset)
            if dataset.data_type == GeoDataset.VECTOR:
                item["geojson"] = json.loads(GeoJSONSerializer().serialize(
                    dataset.features.all(), geometry_field="geometry", fields=("name", "description"), srid=4326
                ))["features"]
            result.append(item)
    except DatabaseError:
        if connection.vendor != "postgresql":
            message = "Django is using SQLite, so the PostGIS dataset tables are unavailable. Set DATABASE_URL to your Supabase PostgreSQL connection URI, enable PostGIS, and run `python manage.py migrate`."
        else:
            message = "Dataset tables are missing or the PostGIS database is unavailable. Enable PostGIS and run `python manage.py migrate`."
        return JsonResponse({"error": message}, status=503)
    return JsonResponse({"datasets": result})


@require_GET
def dataset_raster_url(request, dataset_id):
    try:
        dataset = GeoDataset.objects.get(pk=dataset_id, data_type=GeoDataset.RASTER)
    except GeoDataset.DoesNotExist:
        return JsonResponse({"error": "Raster dataset not found."}, status=404)
    except DatabaseError:
        return JsonResponse({"error": "Dataset database is unavailable."}, status=503)
    signed_url = _signed_raster_url(dataset.storage_path)
    if not signed_url:
        return JsonResponse({"error": "Could not create a fresh Supabase Storage link. Check Storage read policies and server network access."}, status=502)
    return JsonResponse({"file_url": signed_url})


def _dataset_json(dataset):
    file_url = dataset.file_url
    if dataset.data_type == GeoDataset.RASTER and dataset.storage_path:
        file_url = _signed_raster_url(dataset.storage_path)
    return {"id": str(dataset.pk), "name": dataset.name, "data_type": dataset.data_type,
            "file_url": file_url, "created_at": dataset.created_at.isoformat()}


def _save_dataset(name, category, upload):
    if category not in {GeoDataset.VECTOR, GeoDataset.RASTER}:
        raise ValueError("Choose a valid dataset category.")
    if category == GeoDataset.RASTER:
        return _save_raster(name, upload)
    features = _read_vector_features(upload)
    if not features:
        raise ValueError("No features were found in this file.")
    with transaction.atomic():
        dataset = GeoDataset.objects.create(name=name, data_type=GeoDataset.VECTOR)
        MapFeature.objects.bulk_create([
            MapFeature(name=str(props.get("name") or name)[:160],
                       description=str(props.get("description") or "")[:10000],
                       geometry=geometry, dataset=dataset)
            for geometry, props in features
        ])
    return dataset


def _read_vector_features(upload):
    suffix = Path(upload.name).suffix.lower()
    temp_root = Path(tempfile.mkdtemp(prefix="webgis-vector-"))
    try:
        if suffix == ".zip":
            with zipfile.ZipFile(upload) as archive:
                for member in archive.infolist():
                    destination = (temp_root / member.filename).resolve()
                    if not destination.is_relative_to(temp_root.resolve()):
                        raise ValueError("The ZIP contains an invalid path.")
                archive.extractall(temp_root)
            sources = list(temp_root.rglob("*.shp"))
            if not sources:
                raise ValueError("The ZIP must contain a shapefile (.shp, .shx, and .dbf).")
            source = sources[0]
            from osgeo import ogr, osr
            data_source = ogr.Open(str(source))
            if data_source is None or data_source.GetLayerCount() < 1:
                raise ValueError("Could not read the shapefile.")
            layer = data_source.GetLayer(0)
            source_srs = layer.GetSpatialRef()
            target_srs = osr.SpatialReference()
            target_srs.ImportFromEPSG(4326)
            transform = osr.CoordinateTransformation(source_srs, target_srs) if source_srs else None
            output = []
            for feature in layer:
                geom_ref = feature.GetGeometryRef()
                if geom_ref is None:
                    continue
                geom = geom_ref.Clone()
                if transform:
                    geom.Transform(transform)
                props = {layer.GetLayerDefn().GetFieldDefn(i).GetName(): feature.GetField(i)
                         for i in range(feature.GetFieldCount())}
                output.append((GEOSGeometry(geom.ExportToWkt(), srid=4326), props))
            return output
        try:
            payload = json.loads(upload.read().decode("utf-8-sig"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ValueError("The GeoJSON file is invalid.") from exc
        collection = payload if payload.get("type") == "FeatureCollection" else {"type": "FeatureCollection", "features": [payload]}
        if collection.get("type") != "FeatureCollection":
            raise ValueError("Upload a GeoJSON Feature or FeatureCollection.")
        output = []
        for feature in collection.get("features", []):
            geometry_json = feature.get("geometry")
            if geometry_json:
                output.append((GEOSGeometry(json.dumps(geometry_json), srid=4326), feature.get("properties") or {}))
        return output
    finally:
        import shutil
        shutil.rmtree(temp_root, ignore_errors=True)


def _save_raster(name, upload):
    base_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    api_key = os.getenv("SUPABASE_KEY", "")
    bucket = os.getenv("SUPABASE_STORAGE_BUCKET", "geospatial-data")
    if not base_url or not api_key:
        raise ValueError("Supabase Storage is not configured (SUPABASE_URL and SUPABASE_KEY).")
    path = f"{uuid.uuid4()}{Path(upload.name).suffix.lower()}"
    endpoint = f"{base_url}/storage/v1/object/{bucket}/{path}"
    request = Request(endpoint, data=upload.read(), method="POST", headers={
        "apikey": api_key, "Authorization": f"Bearer {api_key}",
        "Content-Type": "image/tiff", "x-upsert": "false",
    })
    try:
        with urlopen(request, timeout=60) as response:
            if response.status not in {200, 201}:
                raise ValueError("Supabase Storage rejected the upload.")
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:300]
        raise ValueError(f"Supabase Storage upload failed: {detail}") from exc
    except URLError as exc:
        raise ValueError("Could not reach Supabase Storage.") from exc
    return GeoDataset.objects.create(name=name, data_type=GeoDataset.RASTER, storage_path=path)


def _signed_raster_url(path):
    base_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    api_key = os.getenv("SUPABASE_KEY", "")
    bucket = os.getenv("SUPABASE_STORAGE_BUCKET", "geospatial-data")
    if not base_url or not api_key:
        return ""
    endpoint = f"{base_url}/storage/v1/object/sign/{bucket}/{path}"
    request = Request(endpoint, data=json.dumps({"expiresIn": 3600}).encode(), method="POST", headers={
        "apikey": api_key, "Authorization": f"Bearer {api_key}", "Content-Type": "application/json",
    })
    try:
        with urlopen(request, timeout=15) as response:
            payload = json.loads(response.read().decode())
        signed = payload.get("signedURL", "")
        return f"{base_url}/storage/v1{signed}" if signed.startswith("/") else signed
    except (HTTPError, URLError, ValueError, json.JSONDecodeError):
        return ""


@require_POST
def analyze_water(request):
    """Validate an uploaded raster/vector dataset and report processing status.

    The response is deliberately explicit when optional geospatial dependencies
    are absent; deployments can add rasterio/geopandas to enable analysis.
    """
    upload = request.FILES.get("file")
    if upload is None:
        return JsonResponse({"status": "error", "message": "Choose an imagery or shapefile upload."}, status=400)

    apply_correction = request.POST.get("apply_correction", "false").lower() in {"true", "1", "yes", "on"}
    ext = os.path.splitext(upload.name)[1].lower()
    allowed = {".tif", ".tiff", ".zip", ".shp"}
    if ext not in allowed:
        return JsonResponse({"status": "error", "message": "Supported inputs are .tif, .tiff, .shp, or a zipped shapefile."}, status=400)

    # A shapefile is a set of files. For separate uploads, require its key
    # companion files; ZIP is also supported for convenient grouped upload.
    if ext == ".shp":
        companions = request.FILES.getlist("companions")
        stem = os.path.splitext(upload.name)[0].lower()
        exts = {os.path.splitext(item.name)[1].lower() for item in companions if os.path.splitext(item.name)[0].lower() == stem}
        if not {".dbf", ".shx"}.issubset(exts):
            return JsonResponse({"status": "error", "message": "A shapefile needs matching .dbf and .shx companion files. You may upload a ZIP containing the shapefile set."}, status=400)
    elif ext == ".zip":
        try:
            with zipfile.ZipFile(upload) as archive:
                names = [name for name in archive.namelist() if not name.endswith("/")]
                shp_stems = {os.path.splitext(os.path.basename(name))[0].lower() for name in names if name.lower().endswith(".shp")}
                if not shp_stems:
                    return JsonResponse({"status": "error", "message": "The ZIP archive does not contain a shapefile."}, status=400)
                if not any(any(os.path.splitext(os.path.basename(name))[0].lower() == stem and name.lower().endswith(".dbf") for name in names) and any(os.path.splitext(os.path.basename(name))[0].lower() == stem and name.lower().endswith(".shx") for name in names) for stem in shp_stems):
                    return JsonResponse({"status": "error", "message": "The ZIP must contain a matching .shp, .shx, and .dbf file set."}, status=400)
        except (zipfile.BadZipFile, OSError):
            return JsonResponse({"status": "error", "message": "The uploaded ZIP file is invalid."}, status=400)

    # Image analysis requires backend processing support. Avoid claiming a
    # water layer exists until a real processing pipeline can generate one.
    if ext in {".tif", ".tiff"}:
        try:
            import rasterio  # noqa: F401
        except ImportError:
            return JsonResponse({"status": "error", "message": "Raster analysis is not configured on this server yet (rasterio is required)."}, status=501)
        return JsonResponse({"status": "error", "message": "The raster was received, but no band mapping or water-mask output pipeline is configured yet."}, status=501)

    return JsonResponse({"status": "error", "message": "Shapefile upload validation succeeded. Water detection requires satellite raster imagery (.tif or .tiff)."}, status=422)


def feature_collection(request):
    if connection.vendor != "postgresql":
        # The demo map remains viewable with a small client-side sample while
        # PostGIS is paused. Real spatial querying resumes when PostGIS is enabled.
        return JsonResponse({
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "properties": {"name": "Bangkok City Hall", "description": "Sample location — connect PostGIS to load stored features."}, "geometry": {"type": "Point", "coordinates": [100.5018, 13.7563]}},
                {"type": "Feature", "properties": {"name": "Lumphini Park", "description": "Sample park location."}, "geometry": {"type": "Point", "coordinates": [100.5418, 13.7308]}}
            ]
        }, content_type="application/geo+json")
    features = MapFeature.objects.all()
    bbox = request.GET.get("bbox")
    if bbox:
        try:
            west, south, east, north = map(float, bbox.split(","))
        except ValueError:
            return JsonResponse({"error": "bbox must be west,south,east,north"}, status=400)
        if not (-180 <= west <= 180 and -180 <= east <= 180 and -90 <= south <= 90 and -90 <= north <= 90):
            return JsonResponse({"error": "bbox coordinates are outside WGS84 bounds"}, status=400)
        if south > north:
            return JsonResponse({"error": "bbox south must be less than or equal to north"}, status=400)

        if west <= east:
            boundary = Polygon.from_bbox((west, south, east, north))
            boundary.srid = 4326
            features = features.filter(geometry__intersects=boundary)
        else:
            # A viewport can cross the antimeridian; query its two parts.
            east_half = Polygon.from_bbox((-180, south, east, north))
            west_half = Polygon.from_bbox((west, south, 180, north))
            east_half.srid = west_half.srid = 4326
            from django.db.models import Q
            features = features.filter(Q(geometry__intersects=east_half) | Q(geometry__intersects=west_half))

    try:
        data = GeoJSONSerializer().serialize(
            features, geometry_field="geometry", fields=("name", "description"), srid=4326
        )
    except DatabaseError:
        return JsonResponse({"error": "PostGIS is not reachable or migrations have not been applied."}, status=503)
    return HttpResponse(data, content_type="application/geo+json")
