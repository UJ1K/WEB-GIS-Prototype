# Graph Report - Project WEBGIS  (2026-10-05)

## Corpus Check
- 25 files · ~12,031 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 9 file(s) not represented in the graph (top: (none) 2, .log 2, .css 2)

## Summary
- 152 nodes · 229 edges · 19 communities (10 shown, 9 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f47108d9`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- views.py
- os
- map.js
- MapFeature
- 0002_geodataset_mapfeature_dataset.py
- print-layout.js
- admin.py
- loadDatasets
- addRasterImage
- renderLocalRaster
- apps.py
- enforceLayerHierarchy
- Security Policy
- AGENTS.md
- CLAUDE.md
- copilot-instructions.md

## God Nodes (most connected - your core abstractions)
1. `MapFeature` - 10 edges
2. `GeoDataset` - 9 edges
3. `addRasterImage()` - 7 edges
4. `loadDatasets()` - 7 edges
5. `_save_dataset()` - 6 edges
6. `registerOrderedLayer()` - 6 edges
7. `applyBasemapMode()` - 6 edges
8. `showDrawn()` - 6 edges
9. `datasets_api()` - 5 edges
10. `_read_vector_features()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `Dataset manager` --references--> `MapFeature`  [INFERRED]
  README.md → maps/models.py
- `Django Web GIS` --references--> `MapFeature`  [INFERRED]
  README.md → maps/models.py
- `feature_collection()` --uses--> `MapFeature`  [INFERRED]
  maps/views.py → maps/models.py
- `_dataset_json()` --uses--> `GeoDataset`  [INFERRED]
  maps/views.py → maps/models.py
- `dataset_raster_url()` --uses--> `GeoDataset`  [INFERRED]
  maps/views.py → maps/models.py

## Import Cycles
- None detected.

## Communities (19 total, 9 thin omitted)

### Community 0 - "views.py"
Cohesion: 0.09
Nodes (13): GeoDataset, Meta, analyze_water(), data_manager(), _dataset_json(), dataset_raster_url(), datasets_api(), export_map_image() (+5 more)

### Community 1 - "os"
Cohesion: 0.10
Nodes (3): main(), carto_voyager_tile(), map_view()

### Community 2 - "map.js"
Cohesion: 0.22
Nodes (13): addSatelliteLayer(), addVoyagerLayer(), applyBasemapMode(), feature(), finishLinePolygon(), haversine(), polygonArea(), selectBasemap() (+5 more)

### Community 3 - "MapFeature"
Cohesion: 0.25
Nodes (6): MapFeature, Dataset manager, Django Web GIS, Enable spatial storage and the GeoJSON API, Optional pre-commit secret scanning, Run the application

### Community 5 - "print-layout.js"
Cohesion: 0.38
Nodes (9): addGrid(), capturePrintSnapshot(), downloadMapImage(), restoreLayers(), scheduleGridUpdate(), setBasemapVisibility(), setOrientation(), updateScaleText() (+1 more)

### Community 7 - "loadDatasets"
Cohesion: 0.48
Nodes (7): createStoredRasterRow(), loadDatasets(), moveLayerGroup(), orderedLayerKeys(), refreshLayerOrderControls(), registerOrderedLayer(), syncMapLayerOrder()

### Community 8 - "addRasterImage"
Cohesion: 0.33
Nodes (6): addRasterImage(), isGeographicBounds(), paletteColor(), rasterCanvas(), renderIndexPalette(), sampleRasterAt()

### Community 9 - "renderLocalRaster"
Cohesion: 0.33
Nodes (6): populateBands(), removeImageLayer(), renderLocalRaster(), setDashboardMode(), setFile(), setIndexDefaults()

### Community 11 - "enforceLayerHierarchy"
Cohesion: 0.50
Nodes (4): addApplicationLayers(), addCanvasRaster(), enforceLayerHierarchy(), openSurveyPopup()

### Community 15 - "Security Policy"
Cohesion: 0.50
Nodes (3): Reporting a Vulnerability, Security Policy, Supported Versions

## Knowledge Gaps
- **10 isolated node(s):** `Migration`, `Migration`, `graphify`, `graphify`, `Focused AI assistance` (+5 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 58 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `MapFeature` connect `MapFeature` to `views.py`, `admin.py`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `MapFeature` (e.g. with `feature_collection()` and `Dataset manager`) actually correct?**
  _`MapFeature` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Migration`, `Migration`, `graphify` to the rest of the system?**
  _10 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `views.py` be split into smaller, more focused modules?**
  _Cohesion score 0.0907563025210084 - nodes in this community are weakly interconnected._
- **Are the 5 inferred relationships involving `GeoDataset` (e.g. with `_dataset_json()` and `dataset_raster_url()`) actually correct?**
  _`GeoDataset` has 5 INFERRED edges - model-reasoned connections that need verification._
- **Should `os` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._