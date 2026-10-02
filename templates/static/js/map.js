// MapLibre GL JS map, drawing tools, and browser-side GeoTIFF preview.
(() => {
  const regions = { semarang: [110.43491, -6.95711], bangkok: [100.5018, 13.7563], jakarta: [106.8456, -6.2088], chiangmai: [98.9853, 18.7883], kalimantan: [116, -.5], yogyakarta: [110.36, -7.782] };
  let activeRegion = 'semarang';
  let currentBasemap = 'dark';
  let labelsEnabled = true;
  let mapLayersInitialized = false;
  const darkStyleLayerIds = new Set();
  const basemapStyles = {
    dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
  };
  const map = new maplibregl.Map({
    container: 'map',
    style: basemapStyles[currentBasemap],
    center: regions[activeRegion], zoom: 11, attributionControl: true,
    preserveDrawingBuffer: true
  });
  let resolveMapReady;
  const mapReady = new Promise(resolve => { resolveMapReady = resolve; });
  map.once('load', () => resolveMapReady());
  const byId = id => document.getElementById(id);
  const exportButton = byId('exportButton');
  exportButton.addEventListener('click', async () => {
    exportButton.disabled = true;
    exportButton.textContent = 'Opening layout…';
    try {
      await mapReady;
      await new Promise(resolve => map.once('idle', resolve));
      sessionStorage.setItem('webgis-print-state', JSON.stringify(createPrintState()));
      const printWindow = window.open('/print-layout/', '_blank');
      if (!printWindow) throw new Error('The print layout was blocked. Allow pop-ups for this site and try again.');
    } catch (error) {
      window.alert(error.message || 'Could not prepare the print layout.');
    } finally {
      exportButton.disabled = false;
      exportButton.textContent = '➤ Export as Map';
    }
  });
  const setText = (id, value) => { const el = byId(id); if (el) el.textContent = value; };
  const setVisibility = (id, visible) => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none'); };
  const setOpacity = (id, value) => { if (map.getLayer(id)) map.setPaintProperty(id, 'raster-opacity', value); };
  const orderLayerGroups = new Map();
  function registerOrderedLayer(key, layerIds) { orderLayerGroups.set(key, layerIds.filter(id => map.getLayer(id))); refreshLayerOrderControls(); }
  function createPrintState() {
    const layers = [];
    const layerRows = [...document.querySelectorAll('.layer-order-row')];
    layerRows.forEach(row => {
      const key = row.dataset.layerKey;
      const ids = orderLayerGroups.get(key) || [];
      const activeIds = ids.filter(id => map.getLayer(id) && map.getLayoutProperty(id, 'visibility') !== 'none');
      if (!activeIds.length) return;
      const name = row.querySelector('.layer-row-title')?.textContent?.trim() || key;
      const color = key === 'calculated-index' ? activePalette.colors : (key.startsWith('dataset-') ? ['#52ff9a'] : ['#52ff9a']);
      layers.push({ key, name, color, opacity: key === 'calculated-index' ? Number(resultOpacity.value) / 100 : key === 'local-input' ? Number(inputOpacity.value) / 100 : 1 });
    });
    const bounds = map.getBounds();
    const rasters = [];
    if (rasterRecord?.canvas) rasters.push({ key: 'local-input', bounds: rasterRecord.bounds, opacity: Number(inputOpacity.value) / 100, dataUrl: rasterRecord.canvas.toDataURL('image/png') });
    if (indexRecord?.canvas) rasters.push({ key: 'calculated-index', bounds: indexRecord.bounds, opacity: Number(resultOpacity.value) / 100, dataUrl: indexRecord.canvas.toDataURL('image/png') });
    return {
      center: map.getCenter().toArray(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch(),
      basemap: currentBasemap, labels: labelsEnabled, terrain: byId('btn-terrain').getAttribute('aria-pressed') === 'true',
      layers, drawnFeatures: drawnFeatures.filter(item => !['preview', 'measure'].includes(item.properties?.kind)),
      datasets: [...orderLayerGroups.keys()].filter(key => key.startsWith('dataset-') && orderLayerGroups.get(key)?.some(id => map.getLayoutProperty(id, 'visibility') !== 'none')),
      rasters,
      bbox: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
      title: `${activeRegion.charAt(0).toUpperCase()}${activeRegion.slice(1)} Map`,
      createdAt: new Date().toISOString()
    };
  }
  function orderedLayerKeys() { return [...document.querySelectorAll('.layer-order-row')].map(row => row.dataset.layerKey).filter(key => orderLayerGroups.has(key)); }
  function syncMapLayerOrder() {
    const labelBoundary = map.getStyle()?.layers?.find(layer => layer.type === 'symbol')?.id;
    orderedLayerKeys().forEach(key => (orderLayerGroups.get(key) || []).forEach(id => { if (map.getLayer(id)) map.moveLayer(id, labelBoundary); }));
  }
  function refreshLayerOrderControls() {
    document.querySelectorAll('.layer-order-row').forEach(row => {
      const key = row.dataset.layerKey, actions = row.querySelector('.layer-order-actions');
      if (!actions || !orderLayerGroups.has(key)) return;
      actions.replaceChildren();
      [['top', '⇈', 'Move to top'], ['up', '↑', 'Move up'], ['down', '↓', 'Move down'], ['bottom', '⇊', 'Move to bottom']].forEach(([direction, icon, label]) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'layer-order-action'; button.textContent = icon; button.title = label; button.setAttribute('aria-label', label); button.onclick = () => moveLayerGroup(key, direction); actions.append(button);
      });
      const options = row.querySelector('.layer-order-options');
      if (options) options.onclick = () => { const open = !row.classList.contains('layer-order-open'); document.querySelectorAll('.layer-order-row.layer-order-open').forEach(other => { other.classList.remove('layer-order-open'); other.querySelector('.layer-order-options')?.setAttribute('aria-expanded', 'false'); }); row.classList.toggle('layer-order-open', open); options.setAttribute('aria-expanded', String(open)); };
    });
  }
  function moveLayerGroup(key, direction) {
    const keys = orderedLayerKeys(), index = keys.indexOf(key); if (index < 0) return;
    const target = direction === 'top' ? keys.length - 1 : direction === 'bottom' ? 0 : direction === 'up' ? Math.min(keys.length - 1, index + 1) : Math.max(0, index - 1);
    if (target === index) return;
    keys.splice(index, 1); keys.splice(target, 0, key);
    const rows = new Map([...document.querySelectorAll('.layer-order-row')].map(row => [row.dataset.layerKey, row]));
    const list = byId('datasetLayers');
    keys.map(layerKey => rows.get(layerKey)).filter(Boolean).forEach(row => list.append(row));
    syncMapLayerOrder();
  }
  function isGeographicBounds(bounds) {
    return bounds.length === 4 && bounds.every(Number.isFinite) && bounds[0] >= -180 && bounds[2] <= 180 && bounds[1] >= -90 && bounds[3] <= 90 && bounds[0] < bounds[2] && bounds[1] < bounds[3];
  }
  const boundsOf = raster => {
    const named = [raster.xmin, raster.ymin, raster.xmax, raster.ymax];
    if (named.every(Number.isFinite)) {
      if (isGeographicBounds(named)) return named;
      const swapped = [named[1], named[0], named[3], named[2]];
      if (isGeographicBounds(swapped)) return swapped;
      return named;
    }
    const b = raster.bounds ? Array.from(raster.bounds) : null;
    if (b && b.length >= 4 && b.slice(0, 4).every(Number.isFinite)) {
      const candidates = [[b[0], b[1], b[2], b[3]], [b[0], b[3], b[2], b[1]], [b[0], b[2], b[1], b[3]], [b[2], b[0], b[3], b[1]]];
      return candidates.find(isGeographicBounds) || b.slice(0, 4);
    }
    return null;
  };
  const projectionCode = raster => {
    const value = raster.projection;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') { const match = value.match(/(?:EPSG:)?(\d{4,6})$/i); return match ? Number(match[1]) : null; }
    return null;
  };
  const imageCoordinates = bounds => [[bounds[0], bounds[3]], [bounds[2], bounds[3]], [bounds[2], bounds[1]], [bounds[0], bounds[1]]];
  let sourceCounter = 0;
  function removeImageLayer(record) {
    if (!record) return;
    if (map.getLayer(record.layerId)) map.removeLayer(record.layerId);
    if (map.getSource(record.sourceId)) map.removeSource(record.sourceId);
  }

  // Layer hierarchy management: Points (Top) > Lines > Polygons / Rasters (Bottom, above basemap)
  function enforceLayerHierarchy() {
    // Respect explicit layer-panel ordering. Keep only the built-in drawing and
    // survey overlays above the basemap when no panel order applies to them.
    const orderedIds = new Set([...orderLayerGroups.values()].flat());
    ['drawn-polygons', 'drawn-lines', 'drawn-points', 'layer_survey_points'].forEach(id => {
      if (map.getLayer(id) && !orderedIds.has(id)) map.moveLayer(id);
    });
  }

  function addCanvasRaster(canvas, bounds, opacity = 1) {
    const sourceId = `raster-source-${++sourceCounter}`, layerId = `raster-layer-${sourceCounter}`;
    map.addSource(sourceId, { type: 'canvas', canvas, animate: false, coordinates: imageCoordinates(bounds) });

    // Insert raster below vector line/point layers if they exist
    const beforeId = map.getLayer('drawn-polygons') ? 'drawn-polygons' : (map.getLayer('layer_survey_points') ? 'layer_survey_points' : undefined);
    map.addLayer({ id: layerId, type: 'raster', source: sourceId, paint: { 'raster-opacity': opacity, 'raster-fade-duration': 0 } }, beforeId);
    map.getSource(sourceId).pause();
    syncMapLayerOrder();
    enforceLayerHierarchy();
    return { sourceId, layerId, bounds };
  }
  function rasterCanvas(raster, colorAt, maxEdge = 2048, bandIndexes = null) {
    const scale = Math.min(1, maxEdge / Math.max(raster.width, raster.height));
    const width = Math.max(1, Math.floor(raster.width * scale)), height = Math.max(1, Math.floor(raster.height * scale));
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: true }); const image = ctx.createImageData(width, height);
    const values = raster.values || [];
    const bands = bandIndexes || values.map((_, index) => index);
    const sample = new Array(values.length);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const sy = Math.min(raster.height - 1, Math.floor(y / scale)), sx = Math.min(raster.width - 1, Math.floor(x / scale));
      for (const bandIndex of bands) sample[bandIndex] = values[bandIndex]?.[sy]?.[sx];
      const color = colorAt(sample); const i = (y * width + x) * 4;
      if (color) { image.data[i] = color[0]; image.data[i + 1] = color[1]; image.data[i + 2] = color[2]; image.data[i + 3] = color[3] ?? 255; }
    }
    ctx.putImageData(image, 0, 0); return canvas;
  }
  const stretch = (value, minimum, maximum) => Number.isFinite(Number(value)) ? Math.max(0, Math.min(255, Math.round((Number(value) - (Number.isFinite(minimum) ? minimum : 0)) * 255 / ((Number.isFinite(maximum) && maximum > (Number.isFinite(minimum) ? minimum : 0)) ? maximum - (Number.isFinite(minimum) ? minimum : 0) : 1)))) : 0;
  function addRasterImage(raster, colorAt, opacity = 1, bandIndexes = null, maxEdge = 2048) {
    const bounds = boundsOf(raster);
    if (!bounds) throw new Error('This raster has no usable extent. Add georeferencing or CRS information before rendering.');
    const projection = projectionCode(raster);
    if (projection && projection !== 4326) throw new Error(`MapLibre image preview currently requires EPSG:4326; this file reports EPSG:${projection}. Reproject the raster to EPSG:4326 first.`);
    if (!isGeographicBounds(bounds)) throw new Error(`Invalid raster extent: xmin=${bounds[0]}, ymin=${bounds[1]}, xmax=${bounds[2]}, ymax=${bounds[3]}. MapLibre needs longitude/latitude bounds in EPSG:4326.`);
    const canvas = rasterCanvas(raster, colorAt, maxEdge, bandIndexes);
    const record = addCanvasRaster(canvas, bounds, opacity); record.canvas = canvas; return record;
  }
  // MapLibre bounds use [longitude, latitude] for each corner.
  const mapFitBounds = bounds => [[bounds[0], bounds[1]], [bounds[2], bounds[3]]];

  // Basemap controls and navigation.
  byId('zoomIn').onclick = () => map.zoomIn(); byId('zoomOut').onclick = () => map.zoomOut();
  byId('homeExtent').onclick = () => map.flyTo({ center: regions[activeRegion], zoom: 11 });
  byId('regionSelect').onchange = e => { activeRegion = e.target.value; map.flyTo({ center: regions[activeRegion], zoom: 11 }); };
  byId('btn-terrain').onclick = e => { const on = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', String(on)); e.currentTarget.classList.toggle('active', on); e.currentTarget.innerHTML = on ? '☑ Terrain' : '☐ Terrain'; byId('map').style.filter = on ? 'saturate(1.2) contrast(1.1)' : 'none'; };
  const btnLabels = byId('btn-labels');
  function setMapLabelsVisible(visible) {
    map.getStyle()?.layers?.filter(layer => layer.type === 'symbol').forEach(layer => {
      if (map.getLayer(layer.id)) {
        const isDarkStyleLayer = darkStyleLayerIds.has(layer.id);
        const shouldShow = visible && (!isDarkStyleLayer || currentBasemap === 'dark');
        map.setLayoutProperty(layer.id, 'visibility', shouldShow ? 'visible' : 'none');
      }
    });
    setBasemapVisibility(currentBasemap);
  }
  function styleBasemapLabels(mode) {
    // CARTO's styles ship with contrasting label colors already configured.
  }
  function applyBasemapMode(mode) {
    if (!map.isStyleLoaded()) return false;
    if (!map.getSource('voyager')) addVoyagerLayer();
    if (!map.getSource('satellite')) addSatelliteLayer();
    setBasemapVisibility(mode);
    const firstAppLayer = ['drawn-polygons', 'layer_survey_points'].find(id => map.getLayer(id));
    if (firstAppLayer) {
      if (map.getLayer('voyager-layer')) map.moveLayer('voyager-layer', firstAppLayer);
      if (map.getLayer('satellite-layer')) map.moveLayer('satellite-layer', firstAppLayer);
    }
    styleBasemapLabels(mode);
    map.getStyle()?.layers?.filter(layer => layer.type === 'symbol').forEach(layer => {
      if (map.getLayer(layer.id)) {
        const show = labelsEnabled && (!darkStyleLayerIds.has(layer.id) || mode === 'dark');
        map.setLayoutProperty(layer.id, 'visibility', show ? 'visible' : 'none');
      }
    });
    return true;
  }
  function setBasemapVisibility(mode) {
    // Reset every basemap first, then enable only the selected base and its
    // label variant. App data layers are intentionally outside this group.
    darkStyleLayerIds.forEach(id => setVisibility(id, false));
    ['voyager-layer', 'voyager-nolabels-layer', 'satellite-layer'].forEach(id => setVisibility(id, false));
    if (mode === 'dark') {
      darkStyleLayerIds.forEach(id => {
        const layer = map.getLayer(id);
        const show = layer && (layer.type !== 'symbol' || labelsEnabled);
        if (layer) map.setLayoutProperty(id, 'visibility', show ? 'visible' : 'none');
      });
    } else if (mode === 'bright') {
      setVisibility(labelsEnabled ? 'voyager-layer' : 'voyager-nolabels-layer', true);
    } else if (mode === 'satellite') {
      setVisibility('satellite-layer', true);
    }
  }
  function selectBasemap(mode) {
    currentBasemap = mode;
    const dark = mode === 'dark', bright = mode === 'bright', satellite = mode === 'satellite';
    btnLabels.classList.toggle('active', labelsEnabled); btnLabels.innerHTML = labelsEnabled ? '☑ Map Labels' : '☐ Map Labels';
    [['basemapMap', dark], ['basemapMap2', bright], ['basemapSatellite', satellite]].forEach(([id, active]) => {
      byId(id).classList.toggle('active', active); byId(id).setAttribute('aria-pressed', String(active));
    });
    if (!applyBasemapMode(mode)) mapReady.then(() => applyBasemapMode(currentBasemap));
  }
  btnLabels.onclick = () => { labelsEnabled = !labelsEnabled; setMapLabelsVisible(labelsEnabled); btnLabels.classList.toggle('active', labelsEnabled); btnLabels.innerHTML = labelsEnabled ? '☑ Map Labels' : '☐ Map Labels'; };
  byId('basemapMap').onclick = () => selectBasemap('dark'); byId('basemapMap2').onclick = () => selectBasemap('bright'); byId('basemapSatellite').onclick = () => selectBasemap('satellite');
  byId('mobileMenu').onclick = () => document.querySelector('.top-right-widget').classList.toggle('mobile-open');
  const layerPanel = byId('floating_layer_control'), layerPanelToggle = byId('toggleLayerPanelBtn');
  layerPanelToggle.onclick = () => {
    const collapsed = layerPanel.classList.toggle('layer-panel-collapsed');
    layerPanelToggle.setAttribute('aria-expanded', String(!collapsed));
    layerPanelToggle.setAttribute('aria-label', `${collapsed ? 'Show' : 'Hide'} Layers Management`);
    layerPanelToggle.textContent = collapsed ? '▲' : '▼';
  };
  const layerPanelHandle = byId('layerPanelDragHandle');
  let panelDrag = null;
  layerPanelHandle.addEventListener('pointerdown', event => {
    if (event.target.closest('button, a, input, select')) return;
    const rect = layerPanel.getBoundingClientRect();
    panelDrag = { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
    layerPanelHandle.setPointerCapture(event.pointerId);
    layerPanel.classList.add('layer-panel-dragging');
    event.preventDefault();
  });
  layerPanelHandle.addEventListener('pointermove', event => {
    if (!panelDrag || panelDrag.pointerId !== event.pointerId) return;
    const left = Math.max(0, Math.min(window.innerWidth - layerPanel.offsetWidth, event.clientX - panelDrag.offsetX));
    const top = Math.max(0, Math.min(window.innerHeight - layerPanel.offsetHeight, event.clientY - panelDrag.offsetY));
    layerPanel.style.left = `${left}px`;
    layerPanel.style.top = `${top}px`;
    layerPanel.style.right = 'auto';
  });
  const stopPanelDrag = event => {
    if (!panelDrag || panelDrag.pointerId !== event.pointerId) return;
    panelDrag = null;
    layerPanel.classList.remove('layer-panel-dragging');
  };
  layerPanelHandle.addEventListener('pointerup', stopPanelDrag);
  layerPanelHandle.addEventListener('pointercancel', stopPanelDrag);

  // Drawing, measurement, and GeoJSON/vector layer sources.
  let drawMode = 'pan', pending = [], measurePoints = [], measureFeature = null, drawnFeatures = [];
  const emptyFC = () => ({ type: 'FeatureCollection', features: [] });
  function updateDrawn() {
    const src = map.getSource('drawn-data');
    if (src) src.setData({ type: 'FeatureCollection', features: drawnFeatures });
    enforceLayerHierarchy();
  }
  function feature(geometry, properties = {}) { return { type: 'Feature', geometry, properties }; }

  // CCTV Dummy Vector Data
  const supabaseBaseUrl = (window.SUPABASE_URL || 'https://xjtzyxdnlfzlymlmwwmu.supabase.co').replace(/\/$/, '');
  const cctvFeatures = [
    {
      point_id: "cctv_dummy_01",
      label: "CCTV Station Alpha",
      coordinates: { lat: -6.932970, lon: 110.532177 },
      linked_video: `${supabaseBaseUrl}/storage/v1/object/public/CCTV_Monitoring_Data/cctv_01.mp4`,
      fallback_video: new URL('/static/supplement/media1_overlay.mp4', window.location.origin).href
    },
    {
      point_id: "cctv_dummy_02",
      label: "CCTV Station Beta",
      coordinates: { lat: -6.942065, lon: 110.502661 },
      linked_video: `${supabaseBaseUrl}/storage/v1/object/public/CCTV_Monitoring_Data/cctv_02.mp4`,
      fallback_video: new URL('/static/supplement/media1_overlay.mp4', window.location.origin).href
    }
  ];

  const surveyPoints = {
    type: 'FeatureCollection',
    features: cctvFeatures.map(item => feature(
      { type: 'Point', coordinates: [item.coordinates.lon, item.coordinates.lat] },
      {
        point_id: item.point_id,
        label: item.label,
        linked_video: item.linked_video,
        fallback_video: item.fallback_video,
        lat: item.coordinates.lat,
        lon: item.coordinates.lon
      }
    ))
  };

  function sampleRasterAt(raster, lng, lat) {
    if (!raster || !isGeographicBounds(boundsOf(raster)) || !raster.width || !raster.height) return null;
    const [west, south, east, north] = boundsOf(raster);
    if (lng < west || lng > east || lat < south || lat > north) return null;
    const x = Math.min(raster.width - 1, Math.max(0, Math.floor((lng - west) / (east - west) * raster.width)));
    const y = Math.min(raster.height - 1, Math.max(0, Math.floor((north - lat) / (north - south) * raster.height)));
    const value = raster.values?.[0]?.[y]?.[x];
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }

  // Structured CCTV Popup Interface
  function openSurveyPopup(point) {
    const [lng, lat] = point.geometry.coordinates, props = point.properties || {};
    const container = document.createElement('article');
    container.id = 'cctv_info_popup';
    container.className = 'cctv-info-popup';

    // 1. Header Section
    const header = document.createElement('header');
    header.className = 'cctv-popup-header';

    const title = document.createElement('h3');
    title.className = 'cctv-header-title';
    title.textContent = props.label || props.point_id || 'CCTV Station';

    const actions = document.createElement('div');
    actions.className = 'cctv-header-actions';

    const badge = document.createElement('div');
    badge.className = 'cctv-status-badge';
    const dot = document.createElement('span');
    dot.className = 'cctv-status-dot';
    const badgeText = document.createElement('span');
    badgeText.textContent = 'LIVE';
    badge.append(dot, badgeText);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'cctv-close-btn';
    closeBtn.setAttribute('aria-label', 'Close CCTV popup');
    closeBtn.textContent = '×';

    actions.append(badge, closeBtn);
    header.append(title, actions);

    // 2. Video Section (16:9 container, controls, autoplay, loop, muted)
    const videoSection = document.createElement('section');
    videoSection.className = 'cctv-video-section';

    const video = document.createElement('video');
    video.className = 'cctv-video-player';
    video.controls = true;
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('aria-label', `Live feed for ${props.label || 'CCTV'}`);

    const videoStatus = document.createElement('span');
    videoStatus.className = 'cctv-video-status';
    videoStatus.textContent = 'Connecting feed…';

    const primaryUrl = props.linked_video;
    const fallbackUrl = props.fallback_video;

    video.src = primaryUrl;
    video.addEventListener('loadedmetadata', () => {
      videoStatus.textContent = 'Feed Active';
      video.play().catch(() => { });
    });
    video.addEventListener('error', () => {
      if (fallbackUrl && video.src !== fallbackUrl) {
        videoStatus.textContent = 'Switching to backup feed…';
        video.src = fallbackUrl;
      } else {
        videoStatus.textContent = 'Offline / Stream unavailable';
      }
    });

    videoSection.append(video, videoStatus);

    // 3. Data Grid Section (2 columns for Latitude & Longitude, highlighted Spectral Index)
    const dataGrid = document.createElement('section');
    dataGrid.className = 'cctv-data-grid-section';

    // Row 1: Latitude & Longitude
    const latCol = document.createElement('div');
    latCol.className = 'cctv-data-item';
    const latLabel = document.createElement('span');
    latLabel.className = 'cctv-data-label';
    latLabel.textContent = 'Latitude';
    const latVal = document.createElement('span');
    latVal.className = 'cctv-data-value-coord';
    latVal.textContent = `${lat.toFixed(6)}°`;
    latCol.append(latLabel, latVal);

    const lonCol = document.createElement('div');
    lonCol.className = 'cctv-data-item';
    const lonLabel = document.createElement('span');
    lonLabel.className = 'cctv-data-label';
    lonLabel.textContent = 'Longitude';
    const lonVal = document.createElement('span');
    lonVal.className = 'cctv-data-value-coord';
    lonVal.textContent = `${lng.toFixed(6)}°`;
    lonCol.append(lonLabel, lonVal);

    // Row 2: Spectral Index
    const spectralRow = document.createElement('div');
    spectralRow.className = 'cctv-data-item full-width';
    const spectralLeft = document.createElement('div');
    const spectralLabel = document.createElement('span');
    spectralLabel.className = 'cctv-data-label';
    spectralLabel.textContent = 'Spectral Index';
    const activeIndexName = byId('indexType')?.selectedOptions?.[0]?.textContent || 'NDWI / NDVI';
    const spectralMeta = document.createElement('span');
    spectralMeta.className = 'cctv-data-spectral-meta';
    spectralMeta.textContent = currentIndexResult ? ` (${activeIndexName})` : ' (No raster active)';
    spectralLeft.append(spectralLabel, spectralMeta);

    const extractedValue = sampleRasterAt(currentIndexResult, lng, lat);
    const spectralValue = document.createElement('span');
    spectralValue.className = 'cctv-data-value-spectral';
    spectralValue.textContent = extractedValue !== null ? extractedValue.toFixed(4) : 'N/A';
    spectralRow.append(spectralLeft, spectralValue);

    dataGrid.append(latCol, lonCol, spectralRow);

    container.append(header, videoSection, dataGrid);

    const popup = new maplibregl.Popup({
      className: 'custom-dark-popup cctv-popup-container',
      closeButton: false,
      maxWidth: '380px',
      anchor: 'bottom'
    }).setLngLat([lng, lat]).setDOMContent(container).addTo(map);

    closeBtn.onclick = () => popup.remove();
  }

  function haversine(a, b) { const rad = v => v * Math.PI / 180, lat1 = rad(a[1]), lat2 = rad(b[1]), dlat = lat2 - lat1, dlon = rad(b[0] - a[0]); const h = Math.sin(dlat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlon / 2) ** 2; return 6371008.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)); }
  function polygonArea(coords) { const ring = coords[0] || []; let sum = 0; for (let i = 0; i < ring.length - 1; i++) { const a = ring[i], b = ring[i + 1]; sum += (b[0] - a[0]) * Math.PI / 180 * (2 + Math.sin(a[1] * Math.PI / 180) + Math.sin(b[1] * Math.PI / 180)); } return Math.abs(sum * 6378137 * 6378137 / 2); }
  function showDrawn(geometry, kind, coords) { drawnFeatures.push(feature(geometry, { kind })); updateDrawn(); let message = 'User-drawn feature'; if (kind === 'polygon' || kind === 'rectangle') { const area = polygonArea([coords]); message = `Area: ${(area / 10000).toFixed(2)} ha (${area.toFixed(0)} m²)`; } else if (kind === 'line') { let length = 0; for (let i = 1; i < coords.length; i++)length += haversine(coords[i - 1], coords[i]); message = `Length: ${length >= 1000 ? (length / 1000).toFixed(2) + ' km' : length.toFixed(1) + ' m'}`; } new maplibregl.Popup({ className: 'custom-dark-popup', closeButton: false }).setLngLat(coords[0]).setText(message).addTo(map); }
  function finishLinePolygon() { if (drawMode === 'line' && pending.length >= 2) showDrawn({ type: 'LineString', coordinates: pending.slice() }, 'line', pending); if (drawMode === 'polygon' && pending.length >= 3) { const ring = pending.slice(); ring.push(ring[0]); showDrawn({ type: 'Polygon', coordinates: [ring] }, 'polygon', ring); } pending = []; }
  function setDrawMode(mode) { drawMode = mode; pending = []; byId('measureTool').classList.remove('active'); map.getCanvas().style.cursor = mode === 'pan' ? '' : 'crosshair'; if (mode === 'line' || mode === 'polygon') map.doubleClickZoom.disable(); else map.doubleClickZoom.enable(); document.querySelectorAll('.drawing-toolbar [data-draw-mode]').forEach(b => { b.classList.toggle('active', b.dataset.drawMode === mode); b.setAttribute('aria-pressed', String(b.dataset.drawMode === mode)); }); }
  document.querySelectorAll('.drawing-toolbar [data-draw-mode]').forEach(button => button.addEventListener('click', () => setDrawMode(button.dataset.drawMode)));
  const measureButton = byId('measureTool');
  measureButton.onclick = e => { e.currentTarget.classList.toggle('active'); measurePoints = []; if (measureFeature) { drawnFeatures = drawnFeatures.filter(f => f !== measureFeature); measureFeature = null; updateDrawn(); } map.getCanvas().style.cursor = e.currentTarget.classList.contains('active') ? 'crosshair' : ''; };
  const closePopup = () => { document.querySelectorAll('.map-popup-close').forEach(b => b.onclick = () => document.querySelectorAll('.maplibregl-popup').forEach(p => p.remove())); };
  map.on('click', e => {
    const ll = [e.lngLat.lng, e.lngLat.lat];
    if (measureButton.classList.contains('active')) { measurePoints.push(ll); if (measurePoints.length > 1) { if (measureFeature) drawnFeatures = drawnFeatures.filter(f => f !== measureFeature); measureFeature = feature({ type: 'LineString', coordinates: measurePoints.slice() }, { kind: 'measure' }); drawnFeatures.push(measureFeature); updateDrawn(); const d = haversine(measurePoints.at(-2), measurePoints.at(-1)); new maplibregl.Popup({ closeButton: false, className: 'custom-dark-popup' }).setLngLat(ll).setText(d > 1000 ? `${(d / 1000).toFixed(2)} km` : `${Math.round(d)} m`).addTo(map); } return; }
    if (drawMode === 'point') { showDrawn({ type: 'Point', coordinates: ll }, 'point', [ll]); return; }
    if (drawMode === 'line' || drawMode === 'polygon') { pending.push(ll); if (pending.length > 1) { if (measureFeature) drawnFeatures = drawnFeatures.filter(f => f !== measureFeature); measureFeature = feature({ type: 'LineString', coordinates: pending.slice() }, { kind: 'preview' }); drawnFeatures.push(measureFeature); updateDrawn(); } return; }
    if (drawMode === 'rectangle') { pending.push(ll); if (pending.length === 2) { const [[w, s], [e2, n]] = pending; const ring = [[w, s], [e2, s], [e2, n], [w, n], [w, s]]; showDrawn({ type: 'Polygon', coordinates: [ring] }, 'rectangle', ring); pending = []; } return; }
    const content = document.createElement('div'); content.className = 'map-popup-content'; const header = document.createElement('div'); header.className = 'map-popup-header'; const coordinates = document.createElement('span'); coordinates.textContent = `Lat ${e.lngLat.lat.toFixed(6)}  Lon ${e.lngLat.lng.toFixed(6)}`; const close = document.createElement('button'); close.type = 'button'; close.className = 'map-popup-close'; close.setAttribute('aria-label', 'Close popup'); close.textContent = '×'; header.append(coordinates, close); const body = document.createElement('div'); body.className = 'map-popup-body'; body.textContent = currentRaster ? 'Active raster loaded. Pixel values are not sampled at this location.' : 'No raster data is loaded at this location.'; content.append(header, body); new maplibregl.Popup({ className: 'custom-dark-popup', closeButton: false, maxWidth: '320px' }).setLngLat(ll).setDOMContent(content).addTo(map); closePopup();
  });
  map.on('dblclick', () => { if (drawMode === 'line' || drawMode === 'polygon') { if (measureFeature) { drawnFeatures = drawnFeatures.filter(f => f !== measureFeature); measureFeature = null; updateDrawn(); } finishLinePolygon(); } });

  // Layer initialization obeying Z-index hierarchy:
  // Area/Raster (z=200) < Line (z=300) < Point (z=400)
  function addSatelliteLayer() {
    if (map.getSource('satellite')) return;
    map.addSource('satellite', { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, attribution: 'Tiles © Esri, Maxar, Earthstar Geographics' });
    map.addLayer({ id: 'satellite-layer', type: 'raster', source: 'satellite', layout: { visibility: 'none' } });
    const firstAppLayer = ['drawn-polygons', 'layer_survey_points'].find(id => map.getLayer(id));
    if (firstAppLayer) map.moveLayer('satellite-layer', firstAppLayer);
  }

  function addVoyagerLayer() {
    if (map.getSource('voyager')) return;
    map.addSource('voyager', { type: 'raster', tiles: ['/tiles/carto-voyager/voyager/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors © CARTO' });
    map.addSource('voyager-nolabels', { type: 'raster', tiles: ['/tiles/carto-voyager/voyager_nolabels/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors © CARTO' });
    map.addLayer({ id: 'voyager-layer', type: 'raster', source: 'voyager', layout: { visibility: 'none' } });
    map.addLayer({ id: 'voyager-nolabels-layer', type: 'raster', source: 'voyager-nolabels', layout: { visibility: 'none' } });
    const firstAppLayer = ['drawn-polygons', 'layer_survey_points'].find(id => map.getLayer(id));
    if (firstAppLayer) {
      map.moveLayer('voyager-layer', firstAppLayer);
      map.moveLayer('voyager-nolabels-layer', firstAppLayer);
    }
  }

  function addApplicationLayers() {
    if (map.getSource('drawn-data')) return;
    mapLayersInitialized = true;

    // 1. Vector Drawn Layers
    map.addSource('drawn-data', { type: 'geojson', data: emptyFC() });
    map.addLayer({ id: 'drawn-polygons', type: 'fill', source: 'drawn-data', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#1aa6bb', 'fill-opacity': .28 } });
    map.addLayer({ id: 'drawn-lines', type: 'line', source: 'drawn-data', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#52ff9a', 'line-width': 3 } });
    map.addLayer({ id: 'drawn-points', type: 'circle', source: 'drawn-data', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 6, 'circle-color': '#52ff9a', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 } });

    // 2. CCTV Dummy Point Layer (Topmost z-index = 400)
    map.addSource('layer_survey_points', { type: 'geojson', data: surveyPoints });
    map.addLayer({
      id: 'layer_survey_points',
      type: 'circle',
      source: 'layer_survey_points',
      paint: {
        'circle-radius': 7,
        'circle-color': '#52ff9a',
        'circle-stroke-color': '#051821',
        'circle-stroke-width': 2,
        'circle-opacity': 0.95
      }
    });

    map.on('mouseenter', 'layer_survey_points', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'layer_survey_points', () => { map.getCanvas().style.cursor = ''; });
    map.on('click', 'layer_survey_points', event => {
      const pt = event.features?.[0];
      if (pt) openSurveyPopup(pt);
    });

    enforceLayerHierarchy();
    loadDatasets();
  }

  map.on('load', () => {
    map.getStyle().layers.forEach(layer => darkStyleLayerIds.add(layer.id));
    addSatelliteLayer();
    addApplicationLayers();
    setMapLabelsVisible(labelsEnabled);
  });

  // Stored datasets: GeoJSON vectors and signed-URL GeoTIFFs.
  function loadDatasets() {
    const container = byId('datasetLayers');
    fetch('/api/datasets/').then(response => { if (!response.ok) throw new Error('Could not load datasets'); return response.json(); }).then(({ datasets }) => {
      container.replaceChildren(); if (!datasets.length) { container.textContent = 'No uploaded datasets'; refreshLayerOrderControls(); return; }
      datasets.forEach(dataset => {
        if (dataset.data_type === 'vektor') {
          const label = document.createElement('div'); label.className = 'layer-order-row'; label.dataset.layerKey = `dataset-${dataset.id}`; const main = document.createElement('div'); main.className = 'layer-order-main'; const checkLabel = document.createElement('label'); checkLabel.className = 'layer-order-visible'; checkLabel.title = 'Toggle vector layer'; const check = document.createElement('input'); check.type = 'checkbox'; check.setAttribute('aria-label', `Show ${dataset.name}`); checkLabel.append(check); const title = document.createElement('span'); title.className = 'layer-row-title'; title.textContent = `${dataset.name} (vector)`; const options = document.createElement('button'); options.type = 'button'; options.className = 'layer-order-options'; options.setAttribute('aria-label', `Ordering options for ${dataset.name}`); options.setAttribute('aria-expanded', 'false'); options.textContent = '⋮'; const actions = document.createElement('div'); actions.className = 'layer-order-actions'; actions.setAttribute('aria-label', 'Layer ordering controls'); main.append(checkLabel, title, options, actions); label.append(main); container.append(label);
          const sourceId = `dataset-vector-${dataset.id}`, layerId = `${sourceId}-fill`, lineId = `${sourceId}-line`, pointId = `${sourceId}-points`;
          map.addSource(sourceId, { type: 'geojson', data: { type: 'FeatureCollection', features: dataset.geojson || [] } });

          // Order: fill at bottom, lines in middle, points on top
          map.addLayer({ id: layerId, type: 'fill', source: sourceId, filter: ['==', ['geometry-type'], 'Polygon'], layout: { visibility: 'none' }, paint: { 'fill-color': '#52ff9a', 'fill-opacity': .18, 'fill-outline-color': '#52ff9a' } }, 'drawn-lines');
          map.addLayer({ id: lineId, type: 'line', source: sourceId, filter: ['==', ['geometry-type'], 'LineString'], layout: { visibility: 'none' }, paint: { 'line-color': '#52ff9a', 'line-width': 2 } }, 'layer_survey_points');
          map.addLayer({ id: pointId, type: 'circle', source: sourceId, filter: ['==', ['geometry-type'], 'Point'], layout: { visibility: 'none' }, paint: { 'circle-radius': 5, 'circle-color': '#52ff9a', 'circle-opacity': .8 } });

          registerOrderedLayer(`dataset-${dataset.id}`, [layerId, lineId, pointId]);
          enforceLayerHierarchy();
          check.onchange = () => [layerId, lineId, pointId].forEach(id => setVisibility(id, check.checked));
        } else createStoredRasterRow(container, dataset);
      });
      orderLayerGroups.set('local-input', rasterRecord ? [rasterRecord.layerId] : []);
      orderLayerGroups.set('calculated-index', indexRecord ? [indexRecord.layerId] : []);
      refreshLayerOrderControls();
      syncMapLayerOrder();
    }).catch(error => { container.textContent = error.message || 'Could not load datasets'; });
  }
  function createStoredRasterRow(container, dataset) {
    const row = document.createElement('div'); row.className = 'database-raster-row layer-order-row'; row.dataset.layerKey = `dataset-${dataset.id}`; const main = document.createElement('div'); main.className = 'layer-order-main'; const visibleLabel = document.createElement('label'); visibleLabel.className = 'layer-order-visible'; visibleLabel.title = 'Toggle raster layer'; const visible = document.createElement('input'); visible.type = 'checkbox'; visible.disabled = true; visible.setAttribute('aria-label', `Show ${dataset.name}`); visibleLabel.append(visible); const title = document.createElement('span'); title.className = 'layer-row-title'; title.textContent = `${dataset.name} (raster)`; title.title = dataset.name; const options = document.createElement('button'); options.type = 'button'; options.className = 'layer-order-options'; options.setAttribute('aria-label', `Ordering options for ${dataset.name}`); options.setAttribute('aria-expanded', 'false'); options.textContent = '⋮'; const actions = document.createElement('div'); actions.className = 'layer-order-actions'; actions.setAttribute('aria-label', 'Layer ordering controls'); main.append(visibleLabel, title, options, actions); const controls = document.createElement('div'); controls.className = 'layer-row-controls database-raster-controls'; const opacityLabel = document.createElement('label'); opacityLabel.append(document.createTextNode('Opacity ')); const opacity = document.createElement('input'); opacity.type = 'range'; opacity.min = '0'; opacity.max = '100'; opacity.value = '80'; opacity.disabled = true; opacityLabel.append(opacity); const button = document.createElement('button'); button.type = 'button'; button.className = 'dataset-render-button'; button.textContent = 'Render'; const status = document.createElement('span'); status.className = 'dataset-render-status'; status.setAttribute('role', 'status'); controls.append(opacityLabel, button); row.append(main, controls, status); container.append(row); let record = null;
    button.onclick = async () => { button.disabled = true; button.textContent = 'Loading…'; status.textContent = 'Getting raster URL…'; try { if (!window.parseGeoraster) throw new Error('GeoTIFF parser unavailable; check connection and reload.'); const urlResponse = await fetch(`/api/datasets/${encodeURIComponent(dataset.id)}/raster-url/`, { headers: { Accept: 'application/json' } }); const urlData = await urlResponse.json(); if (!urlResponse.ok) throw new Error(urlData.error || `Raster URL request failed (${urlResponse.status})`); status.textContent = 'Downloading and reading GeoTIFF…'; const response = await fetch(urlData.file_url); if (!response.ok) throw new Error(`Raster download failed (${response.status})`); const raster = await window.parseGeoraster(await response.arrayBuffer()); const count = raster.numberOfRasters || raster.values?.length || 1; record = addRasterImage(raster, values => { if (values.every(v => v == null || !Number.isFinite(Number(v)))) return null; const rgb = [0, 1, 2].map(i => stretch(values[Math.min(i, count - 1)], raster.mins?.[Math.min(i, count - 1)], raster.maxs?.[Math.min(i, count - 1)])); return [...rgb, 255]; }, Number(opacity.value) / 100, [0, Math.min(1, count - 1), Math.min(2, count - 1)]); map.fitBounds(mapFitBounds(record.bounds), { padding: 24 }); visible.disabled = false; visible.checked = true; opacity.disabled = false; button.hidden = true; registerOrderedLayer(row.dataset.layerKey, [record.layerId]); status.textContent = 'Rendered'; } catch (error) { button.disabled = false; button.textContent = 'Render'; status.textContent = error.message || 'Could not render raster'; row.title = status.textContent; } };
    visible.onchange = () => { if (record) setVisibility(record.layerId, visible.checked); }; opacity.oninput = () => { if (record) setOpacity(record.layerId, Number(opacity.value) / 100); };
  }

  // Local GeoTIFF controls and spectral index output.
  let selectedFile = null, currentRaster = null, rasterRecord = null, indexRecord = null, currentIndexResult = null;
  const palettes = {
    pal_viridis: { name: 'Viridis', use: 'Scientific • accessible', colors: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'] },
    pal_rdylgn: { name: 'RdYlGn', use: 'NDVI • vegetation', colors: ['#d7191c', '#fdae61', '#ffffbf', '#a6d96a', '#1a9641'] },
    pal_ndwi_blues: { name: 'Blues', use: 'NDWI • water', colors: ['#f7fbff', '#c6dbef', '#6baed6', '#2171b5', '#08306b'] },
    pal_turbo: { name: 'Turbo', use: 'LST • heatmap', colors: ['#30123b', '#28bbec', '#a2ffa4', '#fb8022', '#7a0403'] },
    pal_inferno: { name: 'Inferno', use: 'NDBI • built-up', colors: ['#000004', '#420a68', '#932667', '#dd513a', '#fca50a'] },
    pal_spectral: { name: 'Spectral', use: 'Diverging values', colors: ['#d53e4f', '#fc8d59', '#fee08b', '#e6f598', '#99d594', '#3288bd'] }
  };
  let activePalette = palettes.pal_viridis;
  function paletteColor(value) { const position = Math.max(0, Math.min(1, (value + 1) / 2)) * (activePalette.colors.length - 1), i = Math.min(activePalette.colors.length - 2, Math.floor(position)), fraction = position - i; const rgb = activePalette.colors.slice(i, i + 2).map(hex => hex.slice(1).match(/.{2}/g).map(part => parseInt(part, 16))); return [0, 1, 2].map(channel => Math.round(rgb[0][channel] * (1 - fraction) + rgb[1][channel] * fraction)).concat(255); }
  function renderIndexPalette() { if (!currentIndexResult) return; if (indexRecord) removeImageLayer(indexRecord); indexRecord = addRasterImage(currentIndexResult, values => { const value = Number(values[0]); return Number.isFinite(value) ? paletteColor(value) : null; }, Number(resultOpacity.value) / 100, [0], 1024); registerOrderedLayer('calculated-index', [indexRecord.layerId]); setVisibility(indexRecord.layerId, resultVisible.checked); setText('paletteStatus', `${activePalette.name} applied to the calculated index.`); }
  document.querySelectorAll('.palette-card').forEach(button => { const palette = palettes[button.dataset.palette]; if (!palette) return; button.querySelector('.palette-swatch').style.backgroundImage = `linear-gradient(to right, ${palette.colors.join(', ')})`; button.querySelector('.palette-name').textContent = palette.name; button.querySelector('.palette-use').textContent = palette.use; button.addEventListener('click', () => { activePalette = palette; document.querySelectorAll('.palette-card').forEach(card => card.setAttribute('aria-pressed', String(card === button))); if (currentIndexResult) renderIndexPalette(); else setText('paletteStatus', `${palette.name} selected; it will apply when an index is calculated.`); }); });
  const fileInput = byId('fileInput'), dropZone = byId('dropZone'), selectedFilesLabel = byId('selectedFiles'), uploadStatus = byId('uploadStatus'), renderButton = byId('btn_layer_render');
  const replaceRasterButton = byId('replaceRasterButton');
  const inputVisible = byId('chk_layer_visible'), inputOpacity = byId('sld_layer_opacity'), resultVisible = byId('resultLayerVisible'), resultOpacity = byId('resultLayerOpacity');
  inputVisible.onchange = () => { if (rasterRecord) setVisibility(rasterRecord.layerId, inputVisible.checked); }; inputOpacity.oninput = () => { if (rasterRecord) setOpacity(rasterRecord.layerId, Number(inputOpacity.value) / 100); }; resultVisible.onchange = () => { if (indexRecord) setVisibility(indexRecord.layerId, resultVisible.checked); }; resultOpacity.oninput = () => { if (indexRecord) setOpacity(indexRecord.layerId, Number(resultOpacity.value) / 100); };
  registerOrderedLayer('local-input', []); registerOrderedLayer('calculated-index', []);
  function setDashboardMode(analysis) {
    byId('dashboard').classList.toggle('analysis-mode', analysis);
    byId('dashboard').classList.toggle('input-mode', !analysis);
    byId('section_1_input').classList.toggle('hidden', analysis);
    ['section_analysis_raster', 'section_analysis_index', 'spectral_styling_panel'].forEach(id => byId(id).classList.toggle('hidden', !analysis));
  }
  function setFile(file) {
    if (!file) return;
    if (!/\.tiff?$/i.test(file.name)) { uploadStatus.textContent = 'Choose a .tif or .tiff GeoTIFF file.'; return; }
    selectedFile = file;
    byId('localRasterLayerRow').hidden = false;
    byId('input_upload_container').classList.remove('is-collapsed');
    setDashboardMode(true);
    replaceRasterButton.hidden = false;
    selectedFilesLabel.textContent = `${file.name} (${(file.size / 1048576).toFixed(2)} MB)`;
    renderButton.disabled = false; renderButton.hidden = false; renderButton.textContent = 'Render'; uploadStatus.textContent = '';
    currentRaster = null; currentIndexResult = null;
    if (indexRecord) { removeImageLayer(indexRecord); indexRecord = null; }
    resultVisible.checked = false; resultVisible.disabled = true; resultOpacity.disabled = true;
    setText('resultLayerLabel', 'Result: Water Detection');
    setText('rasterInfo', 'TIFF selected. Select Render to inspect dimensions, CRS, and bands.');
    setText('inputLayerLabel', `Input: ${file.name}`);
    byId('bandControls').hidden = true;
    const opacityControl = byId('rasterOpacityControl'); if (opacityControl) opacityControl.hidden = true;
  }
  byId('closeDashboard').addEventListener('click', () => {
    if (rasterRecord) removeImageLayer(rasterRecord); rasterRecord = null; registerOrderedLayer('local-input', []);
    if (indexRecord) removeImageLayer(indexRecord); indexRecord = null; registerOrderedLayer('calculated-index', []);
    currentRaster = null; currentIndexResult = null; selectedFile = null; fileInput.value = '';
    byId('localRasterLayerRow').hidden = true; replaceRasterButton.hidden = true; renderButton.hidden = true; renderButton.disabled = true;
    inputVisible.checked = true; inputVisible.disabled = true; resultVisible.checked = false; resultVisible.disabled = true; resultOpacity.disabled = true; inputOpacity.disabled = true;
    selectedFilesLabel.textContent = 'No files selected'; uploadStatus.textContent = ''; setText('inputLayerLabel', 'Input: Waiting for file…');
    setText('rasterInfo', 'No TIFF loaded. File reading stays in browser memory.'); setText('indexStatus', 'Select a TIFF to enable index calculation.'); setText('resultLayerLabel', 'Result: Water Detection');
    setDashboardMode(false);
  });
  replaceRasterButton.onclick = () => fileInput.click();
  byId('browseFiles').onclick = () => fileInput.click(); dropZone.addEventListener('click', e => { if (e.target === dropZone || e.target.tagName === 'P') fileInput.click(); }); dropZone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } }); fileInput.addEventListener('change', () => setFile(fileInput.files[0]));
  ['dragenter', 'dragover'].forEach(n => dropZone.addEventListener(n, e => { e.preventDefault(); dropZone.style.borderColor = 'var(--cyan)'; }));['dragleave', 'drop'].forEach(n => dropZone.addEventListener(n, e => { e.preventDefault(); dropZone.style.borderColor = '#555'; })); dropZone.addEventListener('drop', e => setFile(Array.from(e.dataTransfer.files || []).find(f => /\.tiff?$/i.test(f.name))));
  function populateBands(raster, count) { const controls = byId('bandControls'); controls.hidden = count < 2;['redBand', 'greenBand', 'blueBand'].forEach((id, index) => { const sel = byId(id); sel.replaceChildren(); for (let b = 0; b < count; b++) { const o = document.createElement('option'); o.value = String(b); o.textContent = `Band ${b + 1}`; sel.append(o); } sel.value = String(Math.min(index, count - 1)); sel.onchange = () => { if (currentRaster) renderLocalRaster(); }; }); const opacityControl = byId('rasterOpacityControl'), opacity = byId('rasterOpacity'); if (opacityControl) opacityControl.hidden = false; if (opacity) opacity.oninput = () => { if (rasterRecord) setOpacity(rasterRecord.layerId, Number(opacity.value)); };[byId('indexBandA'), byId('indexBandB')].forEach(sel => { sel.replaceChildren(); for (let b = 0; b < count; b++) { const o = document.createElement('option'); o.value = String(b); o.textContent = `Band ${b + 1}`; sel.append(o); } sel.disabled = false; }); byId('calculateIndex').disabled = count < 2; setText('indexStatus', count < 2 ? 'At least two bands are needed for a spectral index.' : 'Choose an index and its input bands.'); setIndexDefaults(); }
  function setIndexDefaults() { if (!currentRaster) return; const type = byId('indexType').value, mask = byId('waterMaskMode'); if (mask) { mask.disabled = !['NDWI', 'MNDWI'].includes(type); if (mask.disabled) mask.checked = false; } const count = currentRaster.numberOfRasters || currentRaster.values?.length || 1, defaults = { NDWI: [1, 3], MNDWI: [1, 10], NDVI: [3, 2], NDMI: [3, 10], NDBI: [10, 3] }[type] || [0, 1]; let a = Math.min(defaults[0], count - 1), b = Math.min(defaults[1], count - 1); if (a === b && count > 1) b = (a + 1) % count; byId('indexBandA').value = String(a); byId('indexBandB').value = String(b); }
  byId('indexType').addEventListener('change', setIndexDefaults);
  function renderLocalRaster() { if (!currentRaster) return; if (indexRecord) { removeImageLayer(indexRecord); indexRecord = null; registerOrderedLayer('calculated-index', []); } resultVisible.checked = false; resultVisible.disabled = true; resultOpacity.disabled = true; setText('resultLayerLabel', 'Result: Water Detection'); const raster = currentRaster, count = raster.numberOfRasters || raster.values?.length || 1; const rgb = count >= 3 ? ['redBand', 'greenBand', 'blueBand'].map(id => Number(byId(id).value)) : [0, 0, 0]; const colorAt = values => { if (values.every(v => v == null || !Number.isFinite(Number(v)))) return null; return rgb.map(i => stretch(values[i], raster.mins?.[i], raster.maxs?.[i])).concat(255); }; if (rasterRecord) removeImageLayer(rasterRecord); rasterRecord = addRasterImage(raster, colorAt, Number(byId('rasterOpacity')?.value || .85), rgb); registerOrderedLayer('local-input', [rasterRecord.layerId]); inputVisible.disabled = false; inputOpacity.disabled = false; setOpacity(rasterRecord.layerId, Number(inputOpacity.value) / 100); setVisibility(rasterRecord.layerId, inputVisible.checked); const b = rasterRecord.bounds; map.fitBounds(mapFitBounds(b), { padding: 24 }); uploadStatus.textContent = `Displaying ${selectedFile.name} with selected band mapping.`; }
  byId('calculateIndex').addEventListener('click', () => { if (!currentRaster) return; const raster = currentRaster, bands = raster.values, a = Number(byId('indexBandA').value), b = Number(byId('indexBandB').value), threshold = Number(byId('indexThreshold').value), mask = Boolean(byId('waterMaskMode')?.checked), name = byId('indexType').value; if (!bands?.[a] || !bands?.[b]) { setText('indexStatus', 'This TIFF does not expose decoded band values for index calculation.'); return; } if (!Number.isFinite(threshold) || threshold < -1 || threshold > 1) { setText('indexStatus', 'Threshold must be between -1 and 1.'); return; } const output = Array.from({ length: raster.height }, (_, y) => { const row = new Float32Array(raster.width); for (let x = 0; x < raster.width; x++) { const av = Number(bands[a][y][x]), bv = Number(bands[b][y][x]), sum = av + bv, v = Number.isFinite(av) && Number.isFinite(bv) && sum !== 0 ? (av - bv) / sum : NaN; row[x] = mask && v <= threshold ? NaN : v; } return row; }); const result = { ...raster, values: [output], mins: [-1], maxs: [1], numberOfRasters: 1 }; currentIndexResult = result; renderIndexPalette(); resultVisible.checked = true; resultVisible.disabled = false; resultOpacity.disabled = false; if (indexRecord) setVisibility(indexRecord.layerId, true); setOpacity(indexRecord.layerId, Number(resultOpacity.value) / 100); registerOrderedLayer('calculated-index', indexRecord ? [indexRecord.layerId] : []); setText('resultLayerLabel', `Result: ${name} from ${selectedFile?.name || 'local raster'}`); setText('indexStatus', `${name} calculated from bands ${a + 1} and ${b + 1}${mask ? `; values above ${threshold} shown as water` : ''}.`); });
  renderButton.addEventListener('click', async () => { if (!selectedFile) return; renderButton.disabled = true; renderButton.textContent = 'Rendering…'; setText('rasterInfo', 'Reading GeoTIFF in browser memory…'); try { if (!window.parseGeoraster) throw new Error('GeoTIFF parser failed to load. Check internet/CDN access and reload.'); const raster = await window.parseGeoraster(await selectedFile.arrayBuffer()); if (!raster) throw new Error('The TIFF could not be parsed.'); let georaster = raster, approximate = false; if (!boundsOf(georaster)) { await mapReady; const bounds = map.getBounds(); if (!georaster.width || !georaster.height || !georaster.values) throw new Error('This TIFF has no spatial metadata and its pixels could not be read.'); georaster = { ...georaster, projection: 4326, xmin: bounds.getWest(), xmax: bounds.getEast(), ymin: bounds.getSouth(), ymax: bounds.getNorth(), bounds: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()] }; approximate = true; } await mapReady; currentRaster = georaster; const count = georaster.numberOfRasters || georaster.values?.length || georaster.mins?.length || 1; populateBands(georaster, count); const b = boundsOf(georaster), crs = projectionCode(georaster); setText('rasterInfo', `${selectedFile.name} • ${georaster.width} × ${georaster.height} px • ${count} band(s) • ${crs ? `EPSG:${crs}` : 'CRS not identified'} • extent: ${b.join(', ')}`); renderLocalRaster(); uploadStatus.textContent = approximate ? 'Preview placed over current map view as an approximation; the TIFF contains no location information.' : `Rendered ${selectedFile.name} using its embedded extent. File was not uploaded.`; renderButton.hidden = true; } catch (error) { uploadStatus.textContent = error.message; setText('rasterInfo', `Could not render ${selectedFile.name}: ${error.message}`); renderButton.textContent = 'Render'; } finally { renderButton.disabled = !selectedFile; } });

  // Keep the map canvas aligned when the dashboard animates.
  const dashboard = byId('dashboard'), toggleBtn = byId('toggleDashboardBtn'), mapContainer = byId('map'); let dashboardHidden = false;
  toggleBtn.addEventListener('click', () => { dashboardHidden = !dashboardHidden; if (dashboardHidden) { dashboard.style.transform = 'translateY(100%)'; mapContainer.style.bottom = '0'; toggleBtn.innerHTML = '▲'; } else { dashboard.style.transform = 'translateY(0)'; mapContainer.style.bottom = '250px'; toggleBtn.innerHTML = '▼'; } setTimeout(() => map.resize(), 320); });
})();
