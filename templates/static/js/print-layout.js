(() => {
  const STORAGE_KEY = 'webgis-print-state';
  const state = (() => {
    try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null'); }
    catch { return null; }
  })();
  const $ = id => document.getElementById(id);
  const status = $('layoutStatus');
  if (!state?.center || !Number.isFinite(state.zoom)) {
    status.textContent = 'Map state was not found. Return to the map and choose Export as Map.';
    $('printButton').disabled = true;
    return;
  }

  const basemapStyle = state.basemap === 'dark' ? 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json' : {
    version: 8, sources: {}, layers: [{ id: 'paper-background', type: 'background', paint: { 'background-color': '#e7ecee' } }]
  };
  const map = new maplibregl.Map({
    container: 'printMap', style: basemapStyle, center: state.center, zoom: state.zoom,
    bearing: state.bearing || 0, pitch: state.pitch || 0, attributionControl: true,
    preserveDrawingBuffer: true
  });
  function setBasemapVisibility(mode) {
    if (mode === 'dark') return;
    map.getStyle().layers.filter(layer => layer.type !== 'background').forEach(layer => {
      if (map.getLayer(layer.id)) map.setLayoutProperty(layer.id, 'visibility', 'none');
    });
  }
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 200, unit: 'metric' }), 'bottom-left');
  const inset = new maplibregl.Map({
    container: 'insetMap', style: basemapStyle, center: state.center, zoom: 3,
    interactive: false, attributionControl: false, preserveDrawingBuffer: true
  });

  const titleInput = $('layoutTitleInput'), authorInput = $('authorInput');
  titleInput.value = state.title || 'Map';
  $('layoutTitle').textContent = titleInput.value;
  titleInput.addEventListener('input', () => { $('layoutTitle').textContent = titleInput.value.trim() || 'Untitled map'; });
  authorInput.addEventListener('input', () => { $('layoutAuthor').textContent = authorInput.value.trim() || '—'; });
  $('layoutDate').textContent = new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(new Date(state.createdAt || Date.now()));
  $('centerText').textContent = `Center: ${state.center[1].toFixed(5)}° N, ${state.center[0].toFixed(5)}° E`;
    updateScaleText();
  $('extentText').textContent = `Extent: ${state.bbox.map(value => value.toFixed(3)).join(', ')}`;
  $('northArrow').style.transform = `rotate(${-Number(state.bearing || 0)}deg)`;
  $('attributionText').textContent = state.basemap === 'dark' ? 'Basemap © CARTO · © OpenStreetMap contributors' : (state.basemap === 'satellite' ? 'Imagery © Esri, Maxar, Earthstar Geographics' : 'Map data © OpenStreetMap contributors · © CARTO');

  const colorForLayer = item => item.key === 'calculated-index' ? `linear-gradient(to right, ${(item.color || []).join(', ')})` : (item.key.includes('vector') || item.key.startsWith('dataset-') ? '#52ff9a' : '#3288bd');
  $('legendItems').replaceChildren();
  (state.layers || []).forEach(item => {
    const row = document.createElement('div'); row.className = 'legend-item';
    const symbol = document.createElement('span'); symbol.className = 'legend-symbol'; symbol.style.background = colorForLayer(item); symbol.style.opacity = String(item.opacity ?? 1);
    const name = document.createElement('span'); name.textContent = item.name;
    row.append(symbol, name); $('legendItems').append(row);
  });
  if (!state.layers?.length) $('legendItems').textContent = 'No active data layers';

  function addGrid() {
    if (!map.isStyleLoaded()) return;
    const bounds = map.getBounds(), west = bounds.getWest(), east = bounds.getEast(), south = bounds.getSouth(), north = bounds.getNorth();
    const step = Math.max(.01, Math.pow(10, Math.floor(Math.log10(Math.max(east - west, north - south) / 5))));
    const features = [];
    for (let lon = Math.ceil(west / step) * step; lon <= east; lon += step) features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[lon, south], [lon, north]] } });
    for (let lat = Math.ceil(south / step) * step; lat <= north; lat += step) features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[west, lat], [east, lat]] } });
    if (map.getLayer('print-grid-lines')) map.removeLayer('print-grid-lines');
    if (map.getSource('print-grid')) map.removeSource('print-grid');
    map.addSource('print-grid', { type: 'geojson', data: { type: 'FeatureCollection', features } });
    map.addLayer({ id: 'print-grid-lines', type: 'line', source: 'print-grid', layout: { visibility: gridToggle.checked ? 'visible' : 'none' }, paint: { 'line-color': '#233c45', 'line-width': 1, 'line-opacity': .28, 'line-dasharray': [2, 2] } });
    const mid = (west + east) / 2;
    $('gridTop').textContent = `Longitude ${mid.toFixed(3)}° · grid ${step.toPrecision(1)}°`;
    $('gridBottom').textContent = `Latitude ${((south + north) / 2).toFixed(3)}°`;
  }
  const gridToggle = $('gridToggle');
  function updateScaleText() {
    const latitude = map.getCenter().lat;
    const metersPerPixel = 156543.03392 * Math.cos(latitude * Math.PI / 180) / (2 ** map.getZoom());
    const frameMeters = metersPerPixel * $('printMap').clientWidth;
    const frameOnPaperMeters = parseFloat(getComputedStyle($('paper')).width) / 3779.5276;
    $('zoomText').textContent = `Zoom: ${map.getZoom().toFixed(2)} · Approx. scale 1:${Math.max(1, Math.round(frameMeters / frameOnPaperMeters)).toLocaleString()}`;
  }
  gridToggle.addEventListener('change', () => {
    if (map.getLayer('print-grid-lines')) map.setLayoutProperty('print-grid-lines', 'visibility', gridToggle.checked ? 'visible' : 'none');
  });

  async function restoreLayers() {
    const activeKeys = new Set((state.layers || []).map(layer => layer.key));
    if (state.drawnFeatures?.length) {
      map.addSource('print-drawings', { type: 'geojson', data: { type: 'FeatureCollection', features: state.drawnFeatures } });
      map.addLayer({ id: 'print-drawn-polygons', type: 'fill', source: 'print-drawings', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#1aa6bb', 'fill-opacity': .28 } });
      map.addLayer({ id: 'print-drawn-lines', type: 'line', source: 'print-drawings', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#52ff9a', 'line-width': 3 } });
      map.addLayer({ id: 'print-drawn-points', type: 'circle', source: 'print-drawings', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 6, 'circle-color': '#52ff9a', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 } });
    }
    if (state.datasets?.length) {
      try {
        const response = await fetch('/api/datasets/');
        if (!response.ok) throw new Error('Vector datasets could not be loaded.');
        const { datasets } = await response.json();
        datasets.filter(dataset => activeKeys.has(`dataset-${dataset.id}`) && dataset.data_type === 'vektor').forEach(dataset => {
          const sourceId = `print-dataset-${dataset.id}`;
          map.addSource(sourceId, { type: 'geojson', data: { type: 'FeatureCollection', features: dataset.geojson || [] } });
          map.addLayer({ id: `${sourceId}-fill`, type: 'fill', source: sourceId, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#52ff9a', 'fill-opacity': .18, 'fill-outline-color': '#52ff9a' } });
          map.addLayer({ id: `${sourceId}-line`, type: 'line', source: sourceId, filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#52ff9a', 'line-width': 2 } });
          map.addLayer({ id: `${sourceId}-points`, type: 'circle', source: sourceId, filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 5, 'circle-color': '#52ff9a' } });
        });
      } catch (error) { status.textContent = error.message || 'Some vector data could not be restored.'; }
    }
    for (const item of state.rasters || []) {
      if (!activeKeys.has(item.key) || !item.dataUrl) continue;
      const image = new Image();
      image.src = item.dataUrl;
      await image.decode();
      const sourceId = `print-${item.key}-source`, layerId = `print-${item.key}-layer`;
      map.addSource(sourceId, { type: 'image', url: image.src, coordinates: [[item.bounds[0], item.bounds[3]], [item.bounds[2], item.bounds[3]], [item.bounds[2], item.bounds[1]], [item.bounds[0], item.bounds[1]]] });
      map.addLayer({ id: layerId, type: 'raster', source: sourceId, paint: { 'raster-opacity': item.opacity ?? 1 } });
    }
    if (state.basemap === 'satellite') {
      setBasemapVisibility('satellite');
      map.addSource('print-satellite', { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, attribution: 'Tiles © Esri, Maxar, Earthstar Geographics' });
      map.addLayer({ id: 'print-satellite-layer', type: 'raster', source: 'print-satellite' }, map.getStyle().layers.find(layer => layer.type === 'symbol')?.id);
    } else if (state.basemap === 'bright') {
      setBasemapVisibility('bright');
      map.addSource('print-voyager', { type: 'raster', tiles: ['/tiles/carto-voyager/voyager/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors © CARTO' });
      map.addLayer({ id: 'print-voyager-layer', type: 'raster', source: 'print-voyager' }, map.getStyle().layers.find(layer => layer.type === 'symbol')?.id);
    }
    addGrid();
    const updateExtent = () => {
      const b = map.getBounds();
      if (inset.getSource('print-extent')) inset.removeSource('print-extent');
      if (inset.getLayer('print-extent-fill')) inset.removeLayer('print-extent-fill');
      if (inset.getLayer('print-extent-line')) inset.removeLayer('print-extent-line');
      inset.addSource('print-extent', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[b.getWest(), b.getSouth()], [b.getEast(), b.getSouth()], [b.getEast(), b.getNorth()], [b.getWest(), b.getNorth()], [b.getWest(), b.getSouth()]]] }, properties: {} } });
      inset.addLayer({ id: 'print-extent-fill', type: 'fill', source: 'print-extent', paint: { 'fill-color': '#da4838', 'fill-opacity': .12 } });
      inset.addLayer({ id: 'print-extent-line', type: 'line', source: 'print-extent', paint: { 'line-color': '#d5392d', 'line-width': 2 } });
    };
    updateExtent();
    map.on('moveend', () => { addGrid(); updateExtent(); $('centerText').textContent = `Center: ${map.getCenter().lat.toFixed(5)}° N, ${map.getCenter().lng.toFixed(5)}° E`; updateScaleText(); $('extentText').textContent = `Extent: ${[map.getBounds().getWest(), map.getBounds().getSouth(), map.getBounds().getEast(), map.getBounds().getNorth()].map(value => value.toFixed(3)).join(', ')}`; });
    map.on('rotate', () => { $('northArrow').style.transform = `rotate(${-map.getBearing()}deg)`; });
    status.textContent = '';
  }

  function setOrientation(orientation) {
    const landscape = orientation === 'landscape';
    $('paper').classList.toggle('a4-landscape', landscape);
    $('paper').classList.toggle('a4-portrait', !landscape);
    $('portraitButton').setAttribute('aria-pressed', String(!landscape));
    $('landscapeButton').setAttribute('aria-pressed', String(landscape));
    document.documentElement.style.setProperty('--print-orientation', landscape ? 'landscape' : 'portrait');
    map.resize(); inset.resize();
    updateScaleText();
  }
  $('portraitButton').addEventListener('click', () => setOrientation('portrait'));
  $('landscapeButton').addEventListener('click', () => setOrientation('landscape'));
  $('printButton').addEventListener('click', async () => {
    status.textContent = 'Preparing print…';
    await new Promise(resolve => map.once('idle', resolve));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    status.textContent = '';
    window.print();
  });
  window.addEventListener('beforeprint', () => {
    map.resize(); inset.resize();
    map.once('idle', () => {
      try {
        const image = map.getCanvas().toDataURL('image/png');
        if (!$('printSnapshot')) {
          const snapshot = document.createElement('img'); snapshot.id = 'printSnapshot'; snapshot.alt = 'Map snapshot for printing';
          Object.assign(snapshot.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', zIndex: '2', objectFit: 'fill' });
          $('printMap').append(snapshot);
        }
        $('printSnapshot').src = image;
        document.getElementById('printMap').style.visibility = 'hidden';
      } catch (error) { status.textContent = 'Map image could not be prepared for printing; remove a remote layer or use its provider-supported print option.'; }
    });
  });
  window.addEventListener('afterprint', () => { $('printMap').style.visibility = ''; if ($('printSnapshot')) $('printSnapshot').remove(); map.resize(); inset.resize(); });
  map.once('load', () => {
    if (state.labels === false) map.getStyle().layers.filter(layer => layer.type === 'symbol').forEach(layer => map.setLayoutProperty(layer.id, 'visibility', 'none'));
    map.setFilter('road-label', ['!=', ['get', 'class'], 'path']);
    restoreLayers().then(() => map.resize()).catch(error => { status.textContent = error.message || 'Some map layers could not be restored.'; });
  });
  setOrientation('portrait');
})();
