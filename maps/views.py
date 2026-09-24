import json
import os
import tempfile
import zipfile

from django.contrib.gis.geos import Polygon
from django.contrib.gis.serializers.geojson import Serializer as GeoJSONSerializer
from django.db import DatabaseError, connection
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_POST

from .models import MapFeature


def map_view(request):
    return render(request, "maps/map.html")


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
