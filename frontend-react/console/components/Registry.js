// console/components/Registry.js
//
// Step 1 of the rollout: get a barcode label onto every Rolltainer and
// Hyper Cage, and get every one of them into the asset register.
//
// Leaving the barcode field blank lets the API allocate the next
// RT-nnnnnn itself, which is both fewer keystrokes and free of the race
// two clerks registering at once would otherwise hit.

import React from 'react';
import { ASSET_TYPES } from './constants.js';
import { AssetTable, FilterBar, filterAssets } from './AssetTable.js';
import { SiteManager } from './SiteManager.js';
import { BarcodeScanner } from './BarcodeScanner.js';
import { rollupStatus } from '../../shared/format.js';
const h = React.createElement;

const EMPTY_FILTERS = { type: '', status: '', search: '' };

export function Registry({ api, data, onAssetClick, onChanged, showToast }) {
  const { assets, sites, summary } = data;
  const dcSites = sites.filter((s) => s.type === 'DC');

  const [type, setType] = React.useState(ASSET_TYPES[0]);
  const [homeSite, setHomeSite] = React.useState('');
  const [barcode, setBarcode] = React.useState('');
  const [scanning, setScanning] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [filters, setFilters] = React.useState(EMPTY_FILTERS);

  React.useEffect(() => {
    if (!homeSite && dcSites.length) setHomeSite(dcSites[0].code);
  }, [dcSites, homeSite]);

  const rows = React.useMemo(() => filterAssets(assets, filters, rollupStatus), [assets, filters]);

  async function register() {
    setBusy(true);
    try {
      const created = await api.createAsset(type, homeSite, barcode.trim() || undefined);
      setBarcode('');
      showToast('Registered ' + created.id);
      await onChanged();
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  async function addSite(siteType, code, name, reset) {
    setBusy(true);
    try {
      await api.createSite(code, name, siteType);
      reset();
      showToast('Added ' + code);
      await onChanged();
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  async function removeSite(code) {
    setBusy(true);
    try {
      await api.deleteSite(code);
      showToast('Removed ' + code);
      await onChanged();
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  const coverage = summary ? summary.kpis.taggingCoveragePct : 0;

  return h(React.Fragment, null,
    h('div', { className: 'panel' },
      h('h2', null, 'Step 1 — Barcode Label Application'),
      h('div', { className: 'desc' },
        'Every Rolltainer and Hyper Cage gets a unique barcode label added to the asset register before go-live. ' +
        'Each barcode encodes a unique asset ID linked to the registry.'),

      h('div', { className: 'kpi-grid two' },
        h('div', { className: 'kpi' },
          h('div', { className: 'kv' }, coverage + '%'),
          h('div', { className: 'kl' }, 'Tagging coverage'),
          h('div', { className: 'kt' }, 'Baseline was 77% — target 100% before go-live')),
        h('div', { className: 'kpi' },
          h('div', { className: 'kv' }, assets.length),
          h('div', { className: 'kl' }, 'Assets in the register'),
          h('div', { className: 'kt' }, 'Process: physical audit → registry update → verification scan'))
      ),

      h('h3', null, 'Register a new asset'),
      h('div', { className: 'filters' },
        h('select', { value: type, 'aria-label': 'Asset type', onChange: (e) => setType(e.target.value) },
          ASSET_TYPES.map((t) => h('option', { key: t, value: t }, t))),
        h('select', { value: homeSite, 'aria-label': 'Home distribution centre', onChange: (e) => setHomeSite(e.target.value) },
          dcSites.map((s) => h('option', { key: s.code, value: s.code }, s.code))),
        h('input', {
          type: 'text', className: 'mono grow', value: barcode,
          placeholder: 'Barcode (scan or type — leave blank to auto-generate)',
          'aria-label': 'Barcode',
          onChange: (e) => setBarcode(e.target.value),
          onKeyDown: (e) => { if (e.key === 'Enter' && homeSite) register(); },
        }),
        h('button', { type: 'button', className: 'btn', onClick: () => setScanning(true) }, '⌗ Scan'),
        h('button', {
          type: 'button', className: 'btn primary',
          disabled: busy || !homeSite, onClick: register,
        }, busy ? 'Working…' : 'Register & verify')
      ),
      dcSites.length === 0 && h('div', { className: 'alert warn' }, 'No distribution centres exist yet — add one below first.')
    ),

    h(SiteManager, { sites, onAdd: addSite, onRemove: removeSite, busy }),

    h('div', { className: 'panel' },
      h('h2', null, 'Asset registry'),
      h(FilterBar, { value: filters, onChange: setFilters, typeOptions: ASSET_TYPES }),
      h(AssetTable, {
        assets: rows,
        columns: ['barcode', 'type', 'status', 'homeSite', 'registered'],
        onRowClick: onAssetClick,
      })
    ),

    scanning && h(BarcodeScanner, {
      onResult: (text) => { setBarcode(text); setScanning(false); showToast('Scanned: ' + text); },
      onClose: () => setScanning(false),
    })
  );
}
