// scanner/components/constants.js
//
// Which touch points each operator role is allowed to see. This is a
// UI convenience only — the backend independently enforces the same
// role rules on every write endpoint (see backend/src/routes/
// touchpoints.js), so editing this file cannot grant anyone access
// they don't have.
//
// Kept in step with frontend/mercury-scanner.html: the same 9 stepped
// touch points (7 linear + 2 WSW) and the same 4 non-linear flows, so
// an operator sees the identical menu in either build.

export const ROLES = [
  { id: 'DC',  title: 'DC Operator',  sub: 'Dispatch Open / Close · Return Receipt', needsSite: true },
  { id: 'TDT', title: 'TDT Driver',   sub: 'Vehicle Intake · Loaded Confirm',        needsSite: false },
  { id: 'Hub', title: 'Hub Operator', sub: 'Hub Intake · Empty Collection',          needsSite: true },
  { id: 'WSW', title: 'WSW Operator', sub: 'Wrong Source Warehouse — Intake & Sort', needsSite: true },
];

export const TP_META = [
  { seq: 1, id: 'tp1', title: 'DC Dispatch Open',    role: 'DC',  location: 'Distribution Centre' },
  { seq: 2, id: 'tp2', title: 'DC Dispatch Close',   role: 'DC',  location: 'Distribution Centre' },
  { seq: 3, id: 'tp3', title: 'TDT Dispatch Intake', role: 'TDT', location: 'TDT Vehicle' },
  { seq: 4, id: 'tp4', title: 'TDT Dispatch Loaded', role: 'TDT', location: 'TDT Vehicle' },
  { seq: 5, id: 'tp5', title: 'Hub Intake',          role: 'Hub', location: 'Hub / Vendor Site' },
  { seq: 6, id: 'tp6', title: 'Hub Empty Collection',role: 'Hub', location: 'Hub / Vendor Site' },
  { seq: 7, id: 'tp7', title: 'DC Return Receipt',   role: 'DC',  location: 'Distribution Centre' },
  { seq: 1, id: 'wsw1', labelPrefix: 'WSW', title: 'WSW Intake',         role: 'WSW', location: 'Distribution Centre' },
  { seq: 2, id: 'wsw2', labelPrefix: 'WSW', title: 'WSW Sort & Process', role: 'WSW', location: 'Distribution Centre' },
];

// Non-linear lifecycle flows — asset events that happen outside the
// standard dispatch loop. Shown under "Other movements" in the picker.
// Returns-facility routing is not listed here because it is reached
// from inside TP7, exactly as in the vanilla scanner.
export const NONLINEAR_META = [
  { id: 'damaged', title: 'Damaged Asset Scan-Out',    role: 'TDT', location: 'TDT Vehicle / Yard' },
  { id: 'maint',   title: 'Maintenance Scan-Out / In', role: 'DC',  location: 'Distribution Centre' },
  { id: 'gls',     title: 'GLS Vendor Custody',        role: 'DC',  location: 'Distribution Centre' },
  { id: 'interdc', title: 'Inter-DC Transfer',         role: 'DC',  location: 'Distribution Centre' },
];

export const roleDef = (id) => ROLES.find((r) => r.id === id);
