# Django Web GIS

Leaflet map UI, a GeoDjango `MapFeature` spatial model (WGS84), and a GeoJSON endpoint with viewport filtering.

## Run the map UI

```powershell
$env:PATH = "$(Resolve-Path .venv\Lib\site-packages\osgeo);$env:PATH"
$env:GDAL_LIBRARY_PATH = "$(Resolve-Path .venv\Lib\site-packages\osgeo\gdal.dll)"
$env:GEOS_LIBRARY_PATH = "$(Resolve-Path .venv\Lib\site-packages\osgeo\geos_c.dll)"
.venv\Scripts\python.exe manage.py runserver
```

Open http://127.0.0.1:8000/. The Leaflet assets and OpenStreetMap basemap require browser internet access.

## Enable spatial storage and the GeoJSON API

PostgreSQL 18 and its PostGIS extension are installed in this environment. Copy `.env.example` to `.env` and replace the password with the password you chose for the PostgreSQL `postgres` user. Django loads `.env` automatically; it is excluded from Git.

Create the `webgis` database and enable PostGIS. In pgAdmin, connect to PostgreSQL 18, right-click Databases, create a database named `webgis`, open Query Tool on that database, and run:

```sql
CREATE EXTENSION postgis;
```

Or use `psql` from PowerShell after filling in the correct password in `.env`:

```powershell
Copy-Item .env.example .env
# Edit .env and replace isi_password_postgres_anda with your real password.
```

Install a working psycopg driver in `.venv` (for Windows, `python -m pip install "psycopg[binary]"`), then apply the migration:

```powershell
.venv\Scripts\python.exe manage.py migrate
.venv\Scripts\python.exe manage.py createsuperuser
.venv\Scripts\python.exe manage.py runserver
```

The spatial endpoint is `/api/features/`; use `?bbox=west,south,east,north` to filter features to a map extent. Add or edit features at `/admin/` after creating a superuser.
