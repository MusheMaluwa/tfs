// console/components/SiteMap.js
//
// Leaflet + OpenStreetMap, wrapped in a React component.
//
// Leaflet writes into a DOM node itself, so React must not try to
// reconcile that node's children: the <div> below is rendered empty and
// left alone, and every marker update happens in an effect. That is the
// standard way to host an imperative map library inside React.
//
// The library is loaded by a plain <script> tag in index.html rather
// than imported, because Leaflet 1.9 ships UMD, not ES modules. If it
// hasn't loaded (offline, blocked CDN) the component says so instead of
// rendering a blank grey box.

import React from 'react';
import { SITE_COORDS } from './siteCoords.js';
const h = React.createElement;

const COLORS = { DC: '#0B63CE', Returns: '#1E9E63', Hub: '#6C5CE7', GLS: '#6C5CE7' };

/** Prefers the coordinates the API stores for a site; falls back to the
 *  bundled lookup for sites the database has not geocoded yet. */
export function coordsFor(siteName, sitesByCode) {
  const site = sitesByCode[siteName];
  if (site && site.lat != null && site.lng != null) return [site.lat, site.lng];
  return SITE_COORDS[siteName] || null;
}

export function SiteMap({ siteCounts, sites }) {
  const containerRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const layerRef = React.useRef(null);

  const sitesByCode = React.useMemo(() => Object.fromEntries(sites.map((s) => [s.code, s])), [sites]);

  const active = React.useMemo(
    () => Object.entries(siteCounts || {}).filter(([, n]) => n > 0),
    [siteCounts]
  );
  const mapped = active.filter(([name]) => coordsFor(name, sitesByCode));
  const unmapped = active.filter(([name]) => !coordsFor(name, sitesByCode)).map(([name]) => name);

  const leafletAvailable = typeof window !== 'undefined' && typeof window.L !== 'undefined';

  // Create the map once.
  React.useEffect(() => {
    if (!leafletAvailable || mapRef.current || !containerRef.current) return;
    const L = window.L;
    const map = L.map(containerRef.current, { scrollWheelZoom: false }).setView([-28.8, 24.7], 5); // South Africa
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    return () => { map.remove(); mapRef.current = null; layerRef.current = null; };
  }, [leafletAvailable]);

  // Redraw markers whenever the counts change — the layer group is
  // cleared rather than the map being torn down and rebuilt, so the
  // operator's pan and zoom survive the 60s auto-refresh.
  React.useEffect(() => {
    if (!mapRef.current || !layerRef.current) return;
    const L = window.L;
    layerRef.current.clearLayers();
    const bounds = [];
    mapped.forEach(([name, count]) => {
      const coord = coordsFor(name, sitesByCode);
      const type = sitesByCode[name] ? sitesByCode[name].type : 'Hub';
      const color = COLORS[type] || COLORS.Hub;
      const radius = 6 + Math.min(14, count * 2);
      L.circleMarker(coord, { radius, color, weight: 2, fillColor: color, fillOpacity: 0.55 })
        .bindPopup('<b>' + name + '</b><br>' + count + ' asset' + (count === 1 ? '' : 's'))
        .addTo(layerRef.current);
      bounds.push(coord);
    });
    if (bounds.length) mapRef.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 10 });
  }, [mapped, sitesByCode]);

  return h('div', null,
    h('h3', { className: 'flush' }, 'Map view — asset distribution'),
    h('div', { className: 'desc pull-up' },
      'Plotting the ' + mapped.length + ' active site' + (mapped.length === 1 ? '' : 's') + ' we have coordinates for.',
      unmapped.length > 0 && ' ' + unmapped.length + ' active site(s) have no known location yet: ' +
        unmapped.slice(0, 4).join(', ') + (unmapped.length > 4 ? '…' : '') + '.'
    ),
    h('div', { className: 'map-wrap' },
      leafletAvailable
        ? h('div', { id: 'leafletMap', ref: containerRef })
        : h('div', { className: 'map-fallback' },
            'Map tiles need an internet connection to load (OpenStreetMap). This renders once the app is hosted online.'),
      h('div', { className: 'map-legend' },
        h('span', null, h('i', { style: { background: 'var(--amber)' } }), ' Distribution Centres'),
        h('span', null, h('i', { style: { background: 'var(--violet)' } }), ' Hubs / vendor sites'),
        h('span', null, h('i', { style: { background: 'var(--green)' } }), ' Returns facilities')
      )
    )
  );
}
