/**
 * Stayline – Config.gs
 * Constants, table layouts (the Google Sheet "database"), permission matrix and defaults.
 * Every table is [sheetName, columns]. Never reorder columns of a live sheet.
 */

const TZ = 'Asia/Qatar';
const SESSION_SECONDS = 6 * 3600;             // CacheService max is 6 hours

const ROLES = ['Admin', 'Manager', 'FrontDesk', 'Cashier', 'Housekeeping', 'Sales', 'Accountant'];
const RES_ACTIVE = ['Reserved', 'In-House'];   // reservations that occupy a room
const PAY_TYPE = 'Payment';
const CHARGE_TYPE = 'Charge';

const TBL = {
  USERS:     ['Users', ['id','username','name','role','salt','passHash','active','lastLogin','createdAt','email','mustChange','failCount','locked']],
  PERMS:     ['Permissions', ['permission','description'].concat(ROLES)],
  SETTINGS:  ['Settings', ['key','value']],
  ROOMTYPES: ['RoomTypes', ['code','name','baseRate','maxAdults','active','description']],
  ROOMS:     ['Rooms', ['roomNo','type','floor','status','housekeeping','statusReason','notes','active','hkUpdatedAt','assignedTo']],
  RATEPLANS: ['RatePlans', ['code','name','description','active']],
  RATES:     ['Rates', ['id','plan','roomType','startDate','endDate','rate','active']],
  CHARGES:   ['ChargeCodes', ['code','description','department','type','taxable','active']],
  ACCOMP:    ['Accompany', ['id','resNo','title','firstName','lastName','age','idType','idNo','notes','createdAt']],
  GUESTS:    ['Guests', ['id','title','firstName','lastName','email','phone','nationality','idType','idNo','dob','vip','company','preferences','notes','stays','lastStay','createdAt','updatedAt','alert','alertLevel']],
  GROUPS:    ['Groups', ['id','name','contact','arrival','departure','roomType','roomCount','masterResNo','status','notes','createdAt','createdBy']],
  RES:       ['Reservations', ['resNo','status','guestId','guestName','groupId','roomNo','roomType','arrival','departure','adults','children','plan','rate','channel','market','company','vip','notes','createdBy','createdAt','updatedAt','checkedInAt','checkedOutAt','cancelReason']],
  RATESCHED: ['RateSchedule', ['id','resNo','date','rate','active']],
  FOLIOS:    ['Folios', ['id','resNo','folioNo','name','status','createdAt','closedAt','accountId']],
  ACCOUNTS:  ['Accounts', ['id','code','name','contact','email','creditLimit','active','createdAt']],
  SHIFTS:    ['Shifts', ['id','user','openedAt','closedAt','openingFloat','expectedCash','countedCash','variance','status','notes']],
  POSTINGS:  ['Postings', ['id','folioId','resNo','roomNo','bizDate','code','description','amount','parentId','voided','voidReason','postedBy','createdAt']],
  BIZDATES:  ['BusinessDates', ['date','status','openedAt','closedAt','closedBy','roomsPosted','noShows']],
  PAYMETHODS: ['PaymentMethods', ['code','name','kind','chargeCode','accountId','active']],
  PACKAGES:  ['Packages', ['code','name','description','chargeCode','amount','perNight','active']],
  AUDIT:     ['AuditLog', ['time','user','action','entity','entityId','details']],
  RESLOG:    ['ResLog', ['id','resNo','at','user','action','details']],
  ARAGING:   ['ARAging', ['bizDate','code','name','current','d31','d61','d90','total','snapshotAt']],
  FIXEDRULES: ['FixedRules', ['id','scope','target','code','description','amount','frequency','startDate','endDate','active','lastPostedOn','createdBy','createdAt']],
  ROOMCHG:   ['RoomCharges', ['id','roomNo','bizDate','code','description','amount','ruleId','roomStatus','postedBy','createdAt']]
};

/** [permission, description, Admin, Manager, FrontDesk, Cashier, Housekeeping, Sales, Accountant] */
const PERMISSIONS = [
  ['dashboard.view',        'Dashboard',                                 true,  true,  true,  true,  false, true,  true ],
  ['fixed.manage',          'Fixed charges: set up and stop',            true,  true,  false, false, false, false, false],
  ['rack.view',             'Room rack',                                 true,  true,  true,  false, false, true,  false],
  ['frontdesk.checkin',     'Front desk: check-in / walk-in',            true,  true,  true,  false, false, false, false],
  ['frontdesk.checkout',    'Front desk: check-out',                     true,  true,  true,  true,  false, false, false],
  ['frontdesk.override',    'Override: dirty room, open balance',        true,  true,  false, false, false, false, false],
  ['reservations.view',     'View reservations',                         true,  true,  true,  true,  false, true,  true ],
  ['reservations.create',   'Create reservations',                       true,  true,  true,  false, false, true,  false],
  ['reservations.modify',   'Modify / move / extend reservations',       true,  true,  true,  false, false, true,  false],
  ['reservations.cancel',   'Cancel reservations, mark no-show',         true,  true,  false, false, false, false, false],
  ['guests.view',           'View guest profiles',                       true,  true,  true,  true,  false, true,  false],
  ['guests.manage',         'Create / edit guest profiles',              true,  true,  true,  false, false, true,  false],
  ['groups.manage',         'Groups & group billing',                    true,  true,  false, false, false, true,  false],
  ['rooms.view',            'View rooms & housekeeping board',           true,  true,  true,  false, true,  false, false],
  ['rooms.manage',          'Room types, rooms, out-of-order',           true,  true,  false, false, false, false, false],
  ['housekeeping.update',   'Update housekeeping status',                true,  true,  true,  false, true,  false, false],
  ['folio.view',            'View folios & balances',                    true,  true,  true,  true,  false, false, true ],
  ['folio.post',            'Post charges & payments',                   true,  true,  true,  true,  false, false, false],
  ['folio.transfer',        'Transfer postings between folios',          true,  true,  true,  true,  false, false, false],
  ['folio.void',            'Void postings',                             true,  true,  false, false, false, false, false],
  ['folio.edit',            'Edit or split charges (not payments)',       true,  true,  false, false, false, false, false],
  ['rates.view',            'View rates & rate plans',                   true,  true,  false, false, false, true,  true ],
  ['rates.manage',          'Manage rates, plans & charge codes',        true,  false, false, false, false, false, false],
  ['nightaudit.run',        'Run night audit',                           true,  true,  false, false, false, false, false],
  ['reports.view',          'View reports',                              true,  true,  false, false, false, false, true ],
  ['reports.export',        'Export reports (PDF / CSV)',                true,  true,  false, false, false, false, true ],
  ['audit.view',            'View audit log',                            true,  false, false, false, false, false, true ],
  ['users.manage',          'Manage users & passwords',                  true,  false, false, false, false, false, false],
  ['settings.manage',       'Hotel settings & branding',                 true,  false, false, false, false, false, false],
  ['accounts.view',         'View company accounts (city ledger)',       true,  true,  true,  false, false, true,  true ],
  ['accounts.manage',       'Create accounts, bill folios to companies', true,  true,  false, false, false, false, false],
  ['ar.view',               'View accounts receivable (AR)',             true,  true,  false, false, false, false, true ],
  ['ar.post',               'AR receipts and routing to the city ledger', true, true,  false, false, false, false, true ],
  ['shifts.view',           'View all cashier shifts & variances',       true,  true,  false, false, false, false, true ],
  ['shifts.manage',         'Open / close own cashier shift',            true,  true,  true,  true,  false, false, false],
  ['system.manage',         'System administration: roles, email templates, app link', true,  false, false, false, false, false, false],
  ['folio.refund',          'Refund a payment',                          true,  true,  false, false, false, false, false],
  ...cfgPermRows_(),
];

/** Stayline version. Bump this on every release; it shows on the sign-in page and in the sidebar. */
const APP_VERSION = '1.2.98';
const SETTINGS_DEFAULT = {
  maxLoginAttempts: 5,      // wrong passwords before the account is locked (system admin, minimum 5)
  inactivityMinutes: 30,    // idle minutes before sign-out (system admin)
  appName: 'Stayline',
  hotelName: 'Stayline Hotel',
  ownerName: '',                       // shown under the hotel name in the header (owner or designer credit)
  hotelAddress: '',
  hotelPhone: '',                      // printed on documents
  hotelEmail: '',                      // printed on documents
  hotelAppUrl: '',                     // hotel app link, printed on every document
  loadingMessage: 'Preparing your hotel…',   // shown on the loading screen
  menuLayout: '',                      // system admin: sidebar groups and order (JSON), empty = default
  licenseStart: '',                    // system admin: first day the client can use the app (yyyy-mm-dd)
  licenseExpiry: '',
  licenseNumber: '',                   // system admin: licence number (shown in the sidebar licence box)                   // system admin: last day the client can use the app (yyyy-mm-dd)
  loadingScreen: 'random',             // system admin: random, classic, orbit, flip or pulse
  logoUrl: '',
  currency: 'QAR',
  taxRate: 0.10,                       // applied to every taxable charge (0.10 = 10%)
  checkInTime: '14:00',
  checkOutTime: '12:00',
  businessDate: '',                    // set by setupDatabase(); advanced by night audit
  allowCheckoutWithBalance: 'false',   // checkout blocked while folios have a balance
  autoNoShowOnAudit: 'true',           // night audit marks un-arrived reservations as No-Show
  defaultLanguage: 'en',               // en or ar (layout direction)
  defaultCurrency: 'QAR',              // used when the hotel has no currency
  auditorEmail: '',                    // receives the night audit and AR reports
  auditorAutoSend: 'false',            // email the auditor after each night audit
  intPosUrl: '', intTvUrl: '', intPhoneUrl: '', intCardUrl: '',   // integration addresses (system admin)
  appUrl: '',                          // link to the app, sent to new users (system admin)
  // Emails. Placeholders: {{name}} {{code}} {{minutes}} {{appName}} {{hotelName}} {{username}} {{tempPassword}} {{role}} {{appUrl}}
  otpSubject: 'Your verification code for {{appName}}',
  otpBody: 'Hello {{name}},\n\nYour verification code is {{code}}\n\nUse this code to reset your password. It expires in {{minutes}} minutes.\n\nIf you did not ask for a password reset, you can ignore this email. Your password will not change.',
  doneSubject: 'Your {{appName}} password was changed',
  doneBody: 'Hello {{name}},\n\nYour password was changed just now. If this was not you, contact your administrator at once.',
  welcomeSubject: 'Welcome to {{appName}}: your login details',
  welcomeBody: 'Hello {{name}},\n\nAn account has been created for you at {{hotelName}}.\n\nApp link: {{appUrl}}\nUsername: {{username}}\nTemporary password: {{tempPassword}}\nRole: {{role}}\n\nYou will be asked to choose a new password the first time you sign in.'
};
/** Settings only the system administrator can change (email templates and the app link). */
const SYSTEM_SETTINGS = ['menuLayout', 'licenseStart', 'licenseExpiry', 'licenseNumber', 'loadingScreen', 'maxLoginAttempts', 'inactivityMinutes', 'defaultLanguage', 'defaultCurrency', 'auditorEmail', 'auditorAutoSend', 'intPosUrl', 'intTvUrl', 'intPhoneUrl', 'intCardUrl', 'appUrl', 'welcomeSubject', 'welcomeBody', 'otpSubject', 'otpBody', 'doneSubject', 'doneBody'];

const CHARGE_CODES_DEFAULT = [
  // [code, description, department, type, taxable]
  ['ROOM', 'Room revenue',        'Rooms',    'Charge',  true ],
  ['BF',   'Breakfast',           'F&B',      'Charge',  true ],
  ['FB',   'Food & beverage',     'F&B',      'Charge',  true ],
  ['MB',   'Minibar',             'F&B',      'Charge',  true ],
  ['LAU',  'Laundry',             'Misc',     'Charge',  true ],
  ['SPA',  'Spa',                 'Misc',     'Charge',  true ],
  ['TEL',  'Telephone',           'Misc',     'Charge',  false],
  ['ADJ',  'Adjustment',          'Misc',     'Charge',  false],
  ['TAX',  'Tax',                 'Tax',      'Charge',  false],
  ['CASH', 'Cash payment',        'Payment',  'Payment', false],
  ['CARD', 'Card payment',        'Payment',  'Payment', false],
  ['BANK', 'Bank transfer',       'Payment',  'Payment', false],
  ['DEP',  'Deposit received',    'Payment',  'Payment', false],
  ['LCO',  'Late checkout',       'Rooms',    'Charge',  true ]
];

const RATE_PLANS_DEFAULT = [
  ['BAR',  'Best available rate', 'Standard published rate'],
  ['CORP', 'Corporate',           'Negotiated corporate rate'],
  ['PKG',  'Package',             'Room + breakfast package']
];

const ROOM_TYPES_DEFAULT = [
  // [code, name, baseRate, maxAdults, description]
  ['STD', 'Standard', 350, 2, 'Queen room, city view'],
  ['DLX', 'Deluxe',   500, 2, 'King room, balcony'],
  ['STE', 'Suite',    900, 3, 'Separate living room']
];

const CHARGE_CATS = ['Food & beverage', 'Laundry', 'Minibar', 'Spa', 'Telephone', 'Transport', 'Event', 'Damage', 'Other'];

/* Configuration permissions: for each setup area, view / edit / delete. The system administrator sets them per role
 * in Roles & permissions. Defaults: Admin all; Manager as before (room types, rooms, company accounts editable);
 * Accountant can see company accounts. Property Admin gets them by default except hotel details editing.
 * Row layout: [permission, description, Admin, Manager, FrontDesk, Cashier, Housekeeping, Sales, Accountant]. */
function cfgPermRows_() {
  const areas = [
    ['roomtypes', 'room types', [true, true, true], false],
    ['rooms', 'rooms', [true, true, true], false],
    ['rateplans', 'rate plans', [true, false, false], false],
    ['rates', 'seasonal rates', [true, false, false], false],
    ['chargecodes', 'charge codes', [true, false, false], false],
    ['packages', 'packages', [true, false, false], false],
    ['payments', 'payment methods', [false, false, false], false],
    ['accounts', 'company accounts', [true, true, true], true],
    ['settings', 'hotel details and branding', [false, false], false]
  ];
  const rows = [];
  areas.forEach(a => {
    const area = a[0], label = a[1], m = a[2], acc = a[3];
    const actions = area === 'settings' ? ['view', 'edit'] : ['view', 'edit', 'delete'];
    actions.forEach((act, i) => {
      rows.push(['cfg.' + area + '.' + act, 'Configuration: ' + act + ' ' + label, true, m[i], false, false, false, false, act === 'view' ? acc : false]);
    });
  });
  return rows;
}
