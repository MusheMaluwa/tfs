// console/components/constants.js
//
// Reference copy of the process documentation shown on the dashboard,
// plus the asset type vocabulary. The scanning itself happens in the
// separate scanner app — this is here for training and audit.

export const ASSET_TYPES = ['Rolltainer', 'Hyper Cage'];

export const TP_META = [
  { seq: 1, title: 'DC Dispatch Open',     location: 'Distribution Centre', what: 'Asset is scanned as it leaves the DC for dispatch' },
  { seq: 2, title: 'DC Dispatch Close',    location: 'Distribution Centre', what: 'Dispatch manifest is closed — all assets confirmed loaded' },
  { seq: 3, title: 'TDT Dispatch Intake',  location: 'TDT Vehicle',         what: 'Driver scans assets as they are loaded onto the TDT vehicle' },
  { seq: 4, title: 'TDT Dispatch Loaded',  location: 'TDT Vehicle',         what: 'Driver confirms all assets loaded — dispatch complete' },
  { seq: 5, title: 'Hub Intake',           location: 'Hub / Vendor Site',   what: 'Assets are scanned on arrival at the hub or vendor site' },
  { seq: 6, title: 'Hub Empty Collection', location: 'Hub / Vendor Site',   what: 'Empty assets are scanned as they are collected for return' },
  { seq: 7, title: 'DC Return Receipt',    location: 'Distribution Centre', what: 'Returned assets are scanned back into the DC — cycle complete' },
];

export const WSW_META = [
  { seq: 1, title: 'WSW Intake',          location: 'Distribution Centre', what: 'Misrouted stock arriving from another DC is scanned in at Wrong Source Warehouse' },
  { seq: 2, title: 'WSW Sort & Process',  location: 'Distribution Centre', what: 'Sorted assets are released into active DC stock, ready for normal dispatch to hubs' },
];

export const NONLINEAR_META = [
  { title: 'Damaged Asset Scan-Out',        role: 'TDT Clerk', what: 'Scans a Rolltainer out as damaged/unusable, removing it from the active fleet for write-off or scrapping.' },
  { title: 'Maintenance Scan-Out / Scan-In', role: 'Operator', what: 'Scans a Rolltainer going to repair/service; scanned back in on repair, returning it to active fleet status.' },
  { title: 'GLS Vendor Custody',            role: 'Operator',  what: 'Scans Rolltainers transferred to a GLS third-party site (Johannesburg or Cape Town) and scans them back in on return.' },
  { title: 'Returns Facility Routing',      role: 'Driver',    what: 'Routes empty Rolltainers to a returns processing facility instead of the originating DC.' },
  { title: 'Inter-DC Transfer',             role: 'Operator',  what: 'Rebalances Rolltainer stock between DCs — scanned out of one DC and into another.' },
];

// Site types as stored in the sites table (backend/schema.sql).
export const SITE_TYPES = [
  { type: 'DC',      label: 'Distribution Centres', placeholder: 'e.g. BLO-DC1' },
  { type: 'Hub',     label: 'Hubs / Vendor Sites',  placeholder: 'e.g. Polokwane (POL)' },
  { type: 'Returns', label: 'Returns Facilities',   placeholder: 'e.g. Returns Facility — Durban' },
];

export const REFRESH_MS = 60000;
