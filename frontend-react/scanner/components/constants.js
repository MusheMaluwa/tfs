// scanner/components/constants.js
//
// Which touch points each operator role is allowed to see. This is a
// UI convenience only — the backend independently enforces the same
// role rules on every write endpoint (see backend/src/routes/
// touchpoints.js), so editing this file cannot grant anyone access
// they don't have.

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
];

export const roleDef = (id) => ROLES.find((r) => r.id === id);
