# Django Web GIS

MapLibre GL JS map UI, a GeoDjango `MapFeature` spatial model (WGS84), and a GeoJSON endpoint with viewport filtering.

## Run the application

```powershell
$env:PATH = "$(Resolve-Path .venv\Lib\site-packages\osgeo);$env:PATH"
$env:GDAL_LIBRARY_PATH = "$(Resolve-Path .venv\Lib\site-packages\osgeo\gdal.dll)"
$env:GEOS_LIBRARY_PATH = "$(Resolve-Path .venv\Lib\site-packages\osgeo\geos_c.dll)"
.venv\Scripts\python.exe manage.py runserver
```

Copy `.env.example` to `.env`, then configure the Supabase PostgreSQL connection and a strong `DJANGO_SECRET_KEY` before starting Django. Set `DJANGO_DEBUG=false` outside local development. Supabase is the only supported database; Django no longer falls back to local SQLite. MapLibre GL JS, the GeoTIFF parser, and online basemaps require browser internet access. The browser-side GeoTIFF preview currently expects EPSG:4326 coordinates.

## Enable spatial storage and the GeoJSON API

The app uses GeoDjango and needs PostgreSQL with PostGIS for its spatial feature storage. Open **Project Settings → Database → Connection string**, select a PostgreSQL URI (direct connection or Session pooler), and copy it into `DATABASE_URL` in `.env`. Replace placeholders with your Supabase credentials and generate a unique Django secret key. Django loads `.env` automatically; it is excluded from Git. Keep this database URI private and never put it in browser-side JavaScript.

Use the existing Supabase `postgres` database. Ensure the PostGIS extension is enabled there (Supabase Dashboard → Database → Extensions → `postgis`, or run this SQL in the SQL Editor):

```sql
CREATE EXTENSION postgis;
```

Enter your Supabase database password in `.env`. Install a working psycopg driver in `.venv` (for Windows, `python -m pip install "psycopg[binary]"`), then apply the migrations to create the spatial feature tables in Supabase:

Generate `DJANGO_SECRET_KEY` with a cryptographically secure random value. `DJANGO_DEBUG` defaults to `false`; set it to `true` only for local development. Do not commit `.env` or place database credentials or Supabase service-role keys in browser code. The `SUPABASE_KEY` used by the browser must be a publishable/anon key and must be restricted by your Supabase policies.

### Optional pre-commit secret scanning

Install Gitleaks and the `pre-commit` Python package, then run `pre-commit install` once from the repository root. The configured hook scans staged changes before each commit and blocks detected secrets. See `.pre-commit-config.yaml` for the pinned scanner version.

```powershell
.venv\Scripts\python.exe manage.py migrate
.venv\Scripts\python.exe manage.py createsuperuser
.venv\Scripts\python.exe manage.py runserver
```

The spatial endpoint is `/api/features/`; use `?bbox=west,south,east,north` to filter features to a map extent. Add or edit features at `/admin/` after creating a superuser.

## Dataset manager

Open `/data-manager/` after signing in as a Django staff user to upload GeoJSON or a ZIP shapefile as a vector dataset, or a GeoTIFF to the configured Supabase Storage bucket. Set `SUPABASE_URL`, `SUPABASE_KEY`, and optionally `SUPABASE_STORAGE_BUCKET` in `.env`. Create a private bucket and configure Storage policies to permit uploads and reads for this app. Vector uploads are converted to WGS84 and stored as `MapFeature` rows linked to dataset metadata; `/api/datasets/` returns those features as GeoJSON. Raster links are signed for one hour when requested. A publishable key can only perform actions allowed by your Storage policies; it is not the database password or a service-role secret.
