import type { IndustryTemplateManifest } from "./manifest";

/**
 * The six shipped v1.0.0 templates — the three PHASE-015 priority ones
 * (transcribed VERBATIM from the normative template documents), the
 * two PHASE-017 industry templates (transcribed VERBATIM from the
 * migration 0025 registry seeds), and the PHASE-018 manufacturing
 * template (transcribed VERBATIM from the migration 0026 registry seed;
 * the seeds are canonical; every key, every Arabic string, every
 * numbering rule):
 *
 *   - RETAIL_MANIFEST      docs/industries/templates/retail.md
 *   - GROCERY_MANIFEST     docs/industries/templates/grocery-supermarket.md
 *   - RESTAURANT_MANIFEST  docs/industries/templates/restaurant-cafe.md
 *   - AUTOMOTIVE_TEMPLATE_MANIFEST  apps/api/migrations/0025 (docs mirror:
 *     docs/industries/templates/manifests/manifest.automotive.json)
 *   - DISTRIBUTION_TEMPLATE_MANIFEST apps/api/migrations/0025 (docs mirror:
 *     docs/industries/templates/manifests/manifest.distribution.json)
 *   - FOOD_MANUFACTURING_TEMPLATE_MANIFEST apps/api/migrations/0026 (docs
 *     mirror: docs/industries/templates/manifests/manifest.food_manufacturing.json)
 *
 * CI (scripts/validate-manifests.ts, wired into scripts/ci/local-gate.sh)
 * re-parses each constant against the §3 schema so contracts and docs cannot
 * drift (RISK-020). The constants are deep-frozen: registry manifests are
 * platform-owned, versioned documents — never edited in place (§5/§8).
 */

/** Deep-freeze a JSON-shaped value (records, arrays, and their children). */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    if (Array.isArray(value)) {
      for (const item of value) {
        deepFreeze(item);
      }
    } else {
      for (const key of Object.keys(value)) {
        deepFreeze((value as Record<string, unknown>)[key]);
      }
    }
    Object.freeze(value);
  }
  return value;
}

export const RETAIL_MANIFEST: IndustryTemplateManifest = deepFreeze({
  id: "industry.retail",
  name: "Retail Stores",
  name_ar: "متاجر التجزئة",
  version: "1.0.0",
  required_feature_keys: [
    "industry.template_engine",
    "items.barcodes",
    "items.price_lists",
    "inventory.multi_warehouse",
    "inventory.stock_transfers",
    "inventory.serial_tracking",
    "pos.terminals",
    "pos.sales",
    "pos.offline_queue",
    "pos.receipts",
    "treasury.cashier_shifts",
  ],
  default_modules_enabled: [
    "accounting",
    "partners",
    "items",
    "inventory",
    "sales",
    "purchasing",
    "treasury",
    "tax",
    "reporting",
    "pos",
    "configuration",
  ],
  terminology_overrides: {
    "pos.terminal": { en: "Terminal", ar: "الطرفية" },
    "doc.sales_invoice_pos": { en: "POS sale", ar: "بيع نقطة البيع" },
    "item.exchange": { en: "Exchange", ar: "الاستبدال" },
    "item.variant": { en: "Variant (size/color)", ar: "المقاس / اللون" },
    "item.tag_price": { en: "Tag price", ar: "السعر المعلن" },
    "promo.season_sale": { en: "Season sale", ar: "تخفيضات الموسم" },
  },
  navigation_manifest: {
    groups: [
      {
        id: "selling",
        label: { en: "Selling", ar: "البيع" },
        order: 1,
        items: [
          {
            id: "pos",
            label: { en: "Point of sale", ar: "نقطة البيع" },
            target: "pos.counter",
            feature_key: "pos.sales",
          },
          {
            id: "returns",
            label: { en: "Returns & exchanges", ar: "المرتجعات والاستبدال" },
            target: "sales.credit_notes",
          },
          {
            id: "receipts",
            label: { en: "Receipts", ar: "سندات القبض" },
            target: "treasury.receipts",
          },
        ],
      },
      {
        id: "stock",
        label: { en: "Stock", ar: "المخزون" },
        order: 2,
        items: [
          {
            id: "transfers",
            label: { en: "Branch transfers", ar: "تحويلات الفروع" },
            target: "inventory.transfers",
          },
          {
            id: "imei",
            label: { en: "IMEI register", ar: "سجل الأجهزة" },
            target: "inventory.imei",
            feature_key: "inventory.serial_tracking",
          },
        ],
      },
    ],
  },
  workflow_policies: {
    cash_sales_autopost: true,
    "pos.return_requires_original_invoice": true,
    exchange_same_value_only: false,
    shift_variance_approval_required: true,
    stock_transfer_in_transit_visible: true,
  },
  document_numbering_defaults: {
    sales_invoice: {
      prefix: "INV",
      format: "INV-{yyyy}-{seq:6}",
      per_branch: false,
      reserve_on_approval: false,
    },
    pos_sale: {
      prefix: "POS",
      format: "POS-{branch}-{yy}{MM}-{seq:5}",
      per_branch: true,
      reserve_on_approval: false,
    },
    credit_note: {
      prefix: "CN",
      format: "CN-{yyyy}-{seq:5}",
      per_branch: false,
      reserve_on_approval: false,
    },
    stock_transfer: {
      prefix: "TRF",
      format: "TRF-{yyyy}-{seq:5}",
      per_branch: false,
      reserve_on_approval: false,
    },
  },
  inventory_policy_defaults: {
    costing_method: "WAC",
    default_track_batch: false,
    default_track_expiry: false,
    default_track_serial: false,
    default_imei_tracking: false,
    fefo_picking: false,
    allow_negative_stock: false,
  },
  report_defaults: [
    {
      report_key: "pos.sales_by_terminal",
      pinned: true,
      dashboard: true,
      default_period: "today",
    },
    {
      report_key: "pos.sales_by_hour",
      pinned: true,
      dashboard: true,
      default_period: "this_week",
    },
    {
      report_key: "retail.imei_register",
      pinned: true,
      dashboard: false,
      default_period: "this_month",
    },
    {
      report_key: "inventory.stock_valuation",
      pinned: true,
      dashboard: false,
      default_period: "custom",
    },
  ],
  onboarding_steps: [
    {
      id: "branch_warehouse",
      title: { en: "Create branch and stockroom", ar: "إنشاء الفرع والمستودع" },
      required: true,
    },
    {
      id: "coa_confirm",
      title: { en: "Confirm chart of accounts", ar: "تأكيد دليل الحسابات" },
      required: true,
    },
    {
      id: "categories",
      title: { en: "Item categories & tracking flags", ar: "تصنيفات الأصناف وخيارات التتبع" },
      required: true,
    },
    {
      id: "suppliers",
      title: { en: "Suppliers & opening stock", ar: "الموردون ورصيد المخزون الافتتاحي" },
      required: true,
    },
    {
      id: "terminals",
      title: { en: "Set up POS terminals", ar: "تهيئة أجهزة نقطة البيع" },
      required: true,
      feature_key: "pos.terminals",
    },
    {
      id: "first_shift",
      title: {
        en: "Open first shift and make a sale",
        ar: "افتتاح أول وردية وإجراء أول عملية بيع",
      },
      required: false,
      feature_key: "pos.sales",
    },
  ],
  capability_prerequisites: {
    barcode_pos: {
      level: "REQUIRED",
      feature_keys: ["pos.terminals", "pos.sales", "pos.offline_queue", "pos.receipts"],
      available_from_phase: "PHASE-016",
    },
    cashier_shifts: {
      level: "REQUIRED",
      feature_keys: ["treasury.cashier_shifts"],
      available_from_phase: "PHASE-016",
    },
    imei_tracking: {
      level: "OPTIONAL",
      feature_keys: ["inventory.serial_tracking"],
      available_from_phase: "PHASE-010",
    },
    composite_kits: {
      level: "OPTIONAL",
      feature_keys: ["items.composite_products"],
      available_from_phase: "PHASE-016",
    },
    free_goods_promo: {
      level: "OPTIONAL",
      feature_keys: ["distribution.free_goods"],
      available_from_phase: "PHASE-017",
    },
    landed_costs: {
      level: "OPTIONAL",
      feature_keys: ["purchasing.landed_costs"],
      available_from_phase: "PHASE-011",
    },
  },
});

export const GROCERY_MANIFEST: IndustryTemplateManifest = deepFreeze({
  id: "industry.grocery",
  name: "Grocery & Supermarket",
  name_ar: "البقالات والسوبرماركت",
  version: "1.0.0",
  required_feature_keys: [
    "industry.template_engine",
    "items.barcodes",
    "items.price_lists",
    "distribution.customer_tiers",
    "inventory.multi_warehouse",
    "inventory.batch_tracking",
    "inventory.stock_counts",
    "pos.terminals",
    "pos.sales",
    "pos.offline_queue",
    "pos.barcode_scanning",
    "pos.receipts",
    "treasury.cashier_shifts",
  ],
  default_modules_enabled: [
    "accounting",
    "partners",
    "items",
    "inventory",
    "sales",
    "purchasing",
    "treasury",
    "tax",
    "reporting",
    "pos",
    "configuration",
  ],
  terminology_overrides: {
    "item.scale_item": { en: "Scale item", ar: "صنف الميزان" },
    "batch.expiry": { en: "Expiry date", ar: "تاريخ الانتهاء" },
    "inventory.fefo": { en: "FEFO (nearest expiry first)", ar: "الأقرب انتهاءً يصدر أولاً" },
    "inventory.markdown": { en: "Near-expiry markdown", ar: "تخفيض قرب الانتهاء" },
    "inventory.writeoff": { en: "Write-off", ar: "الإعدام" },
    "item.shelf_life": { en: "Shelf life", ar: "مدة الصلاحية" },
    "purchasing.reorder": { en: "Reorder level", ar: "حد إعادة الطلب" },
  },
  navigation_manifest: {
    groups: [
      {
        id: "selling",
        label: { en: "Selling", ar: "البيع" },
        order: 1,
        items: [
          {
            id: "pos",
            label: { en: "Point of sale", ar: "نقطة البيع" },
            target: "pos.counter",
            feature_key: "pos.sales",
          },
          {
            id: "tiers",
            label: { en: "Customer price tiers", ar: "فئات أسعار العملاء" },
            target: "items.tiers",
          },
        ],
      },
      {
        id: "expiry",
        label: { en: "Expiry control", ar: "الرقابة على الصلاحية" },
        order: 2,
        items: [
          {
            id: "expiry_list",
            label: { en: "Expiry list", ar: "قائمة الصلاحيات" },
            target: "inventory.expiry_list",
          },
          {
            id: "writeoff",
            label: { en: "Write-off register", ar: "سجل الإعدام" },
            target: "inventory.writeoff",
          },
          {
            id: "counts",
            label: { en: "Stock counts", ar: "جرد المخزون" },
            target: "inventory.counts",
          },
        ],
      },
    ],
  },
  workflow_policies: {
    cash_sales_autopost: true,
    expiry_writeoff_requires_approval: true,
    markdown_requires_approval: false,
    batch_expiry_capture_required_on_grn: true,
    scale_item_weighed_lines: true,
    shift_variance_approval_required: true,
  },
  document_numbering_defaults: {
    pos_sale: {
      prefix: "POS",
      format: "POS-{branch}-{yy}{MM}-{seq:5}",
      per_branch: true,
      reserve_on_approval: false,
    },
    sales_invoice: {
      prefix: "INV",
      format: "INV-{yyyy}-{seq:6}",
      per_branch: false,
      reserve_on_approval: false,
    },
    goods_receipt: {
      prefix: "GRN",
      format: "GRN-{yyyy}-{seq:6}",
      per_branch: false,
      reserve_on_approval: false,
    },
    credit_note: {
      prefix: "CN",
      format: "CN-{yyyy}-{seq:5}",
      per_branch: false,
      reserve_on_approval: false,
    },
  },
  inventory_policy_defaults: {
    costing_method: "WAC",
    default_track_batch: true,
    default_track_expiry: true,
    default_track_serial: false,
    default_imei_tracking: false,
    fefo_picking: true,
    allow_negative_stock: false,
  },
  report_defaults: [
    {
      report_key: "inventory.expiry_list",
      pinned: true,
      dashboard: true,
      default_period: "this_week",
    },
    {
      report_key: "grocery.expiry_writeoff",
      pinned: true,
      dashboard: true,
      default_period: "this_month",
    },
    {
      report_key: "pos.sales_by_hour",
      pinned: true,
      dashboard: true,
      default_period: "this_week",
    },
    {
      report_key: "inventory.stock_valuation",
      pinned: true,
      dashboard: false,
      default_period: "custom",
    },
  ],
  onboarding_steps: [
    {
      id: "branch_warehouse",
      title: {
        en: "Create branch, shop floor and backroom",
        ar: "إنشاء الفرع وصالة البيع والمستودع الخلفي",
      },
      required: true,
    },
    {
      id: "coa_confirm",
      title: { en: "Confirm chart of accounts", ar: "تأكيد دليل الحسابات" },
      required: true,
    },
    {
      id: "categories",
      title: {
        en: "Food categories with batch/expiry defaults",
        ar: "تصنيفات الأغذية مع خيارات الدفعة والصلاحية",
      },
      required: true,
    },
    {
      id: "scale_items",
      title: { en: "Set up scale items", ar: "تهيئة أصناف الميزان" },
      required: false,
      feature_key: "pos.barcode_scanning",
    },
    {
      id: "suppliers",
      title: {
        en: "Suppliers & opening stock with batches",
        ar: "الموردون والمخزون الافتتاحي مع الدفعات",
      },
      required: true,
    },
    {
      id: "tiers",
      title: { en: "Price tiers (retail / wholesale)", ar: "فئات الأسعار (تجزئة / جملة)" },
      required: false,
    },
    {
      id: "terminals",
      title: { en: "Set up POS terminals & scales", ar: "تهيئة أجهزة نقطة البيع والموازين" },
      required: true,
      feature_key: "pos.terminals",
    },
    {
      id: "first_count",
      title: {
        en: "Baseline count for expiry-sensitive stock",
        ar: "جرد أساسي للأصناف الحساسة للصلاحية",
      },
      required: true,
    },
  ],
  capability_prerequisites: {
    barcode_pos: {
      level: "REQUIRED",
      feature_keys: ["pos.terminals", "pos.sales", "pos.offline_queue", "pos.receipts"],
      available_from_phase: "PHASE-016",
    },
    scale_barcodes: {
      level: "REQUIRED",
      feature_keys: ["pos.barcode_scanning"],
      available_from_phase: "PHASE-016",
    },
    expiry_tracking_fefo: {
      level: "REQUIRED",
      feature_keys: ["inventory.batch_tracking"],
      available_from_phase: "PHASE-010",
    },
    customer_price_tiers: {
      level: "REQUIRED",
      feature_keys: ["distribution.customer_tiers"],
      available_from_phase: "PHASE-017",
    },
    cashier_shifts: {
      level: "REQUIRED",
      feature_keys: ["treasury.cashier_shifts"],
      available_from_phase: "PHASE-016",
    },
    free_goods_promo: {
      level: "OPTIONAL",
      feature_keys: ["sales.discount_management", "distribution.free_goods"],
      available_from_phase: "PHASE-017",
    },
    composite_kits: {
      level: "OPTIONAL",
      feature_keys: ["items.composite_products"],
      available_from_phase: "PHASE-016",
    },
    qc_inspections: {
      level: "OPTIONAL",
      feature_keys: ["manufacturing.qc"],
      available_from_phase: "PHASE-018",
    },
  },
});

export const RESTAURANT_MANIFEST: IndustryTemplateManifest = deepFreeze({
  id: "industry.restaurant",
  name: "Restaurant & Café",
  name_ar: "المطاعم والمقاهي",
  version: "1.0.0",
  required_feature_keys: [
    "industry.template_engine",
    "items.barcodes",
    "items.price_lists",
    "inventory.multi_warehouse",
    "inventory.batch_tracking",
    "items.composite_products",
    "inventory.stock_counts",
    "pos.terminals",
    "pos.sales",
    "pos.offline_queue",
    "pos.table_service",
    "pos.receipts",
    "treasury.cashier_shifts",
  ],
  default_modules_enabled: [
    "accounting",
    "partners",
    "items",
    "inventory",
    "sales",
    "purchasing",
    "treasury",
    "tax",
    "reporting",
    "pos",
    "configuration",
  ],
  terminology_overrides: {
    "pos.table": { en: "Table", ar: "طاولة" },
    "pos.order": { en: "Order", ar: "طلب" },
    "pos.kitchen": { en: "Kitchen", ar: "المطبخ" },
    "pos.order_type": { en: "Order type", ar: "نوع الطلب" },
    "pos.dine_in": { en: "Dine-in", ar: "داخل المطعم" },
    "pos.takeaway": { en: "Takeaway", ar: "سفري" },
    "pos.delivery": { en: "Delivery", ar: "توصيل" },
    "pos.check": { en: "Guest check", ar: "الحساب" },
    "menu.combo": { en: "Combo / set meal", ar: "وجبة" },
    "menu.modifier": { en: "Modifier (extra)", ar: "إضافة" },
    "pos.z_close": { en: "Z close (day end)", ar: "الإغلاق اليومي" },
    "billing.service_charge": { en: "Service charge", ar: "رسوم الخدمة" },
  },
  navigation_manifest: {
    groups: [
      {
        id: "floor",
        label: { en: "Floor", ar: "صالة المطعم" },
        order: 1,
        items: [
          {
            id: "tables",
            label: { en: "Tables", ar: "الطاولات" },
            target: "pos.floor",
            feature_key: "pos.table_service",
          },
          {
            id: "quick_sale",
            label: { en: "Quick sale", ar: "بيع سريع" },
            target: "pos.counter",
            feature_key: "pos.sales",
          },
          {
            id: "kitchen",
            label: { en: "Kitchen tickets", ar: "تذاكر المطبخ" },
            target: "pos.kitchen",
            feature_key: "pos.kitchen_display",
          },
        ],
      },
      {
        id: "day",
        label: { en: "Daily close", ar: "الإغلاق اليومي" },
        order: 2,
        items: [
          {
            id: "shifts",
            label: { en: "Shifts", ar: "الورديات" },
            target: "treasury.shifts",
          },
          {
            id: "z_close",
            label: { en: "Z close report", ar: "تقرير الإغلاق اليومي" },
            target: "pos.z_close",
          },
        ],
      },
    ],
  },
  workflow_policies: {
    cash_sales_autopost: true,
    default_pos_order_type: "dine_in",
    unpaid_table_holds_no_ledger: true,
    combo_explosion_at_posting: true,
    service_charge_default_rate: 0,
    shift_variance_approval_required: true,
    daily_waste_count_recommended: true,
  },
  document_numbering_defaults: {
    pos_sale: {
      prefix: "RC",
      format: "RC-{branch}-{yy}{MM}-{seq:5}",
      per_branch: true,
      reserve_on_approval: false,
    },
    purchase_order: {
      prefix: "PO",
      format: "PO-{yyyy}-{seq:5}",
      per_branch: false,
      reserve_on_approval: true,
    },
    goods_receipt: {
      prefix: "GRN",
      format: "GRN-{yyyy}-{seq:5}",
      per_branch: false,
      reserve_on_approval: false,
    },
    stock_adjustment: {
      prefix: "ADJ",
      format: "ADJ-{yyyy}-{seq:5}",
      per_branch: false,
      reserve_on_approval: false,
    },
  },
  inventory_policy_defaults: {
    costing_method: "WAC",
    default_track_batch: true,
    default_track_expiry: true,
    default_track_serial: false,
    default_imei_tracking: false,
    fefo_picking: true,
    allow_negative_stock: false,
  },
  report_defaults: [
    {
      report_key: "restaurant.sales_by_table",
      pinned: true,
      dashboard: true,
      default_period: "this_week",
    },
    {
      report_key: "restaurant.order_type_mix",
      pinned: true,
      dashboard: true,
      default_period: "this_week",
    },
    {
      report_key: "pos.sales_by_hour",
      pinned: true,
      dashboard: true,
      default_period: "this_week",
    },
    {
      report_key: "treasury.shift_cash_reconciliation",
      pinned: true,
      dashboard: false,
      default_period: "today",
    },
    {
      report_key: "inventory.expiry_list",
      pinned: true,
      dashboard: true,
      default_period: "this_week",
    },
  ],
  onboarding_steps: [
    {
      id: "branch_floors",
      title: { en: "Branch, kitchen & floor layout", ar: "الفرع والمطبخ وتخطيط الصالة" },
      required: true,
    },
    {
      id: "coa_confirm",
      title: { en: "Confirm chart of accounts", ar: "تأكيد دليل الحسابات" },
      required: true,
    },
    {
      id: "menu",
      title: {
        en: "Build menu (items, combos, modifiers)",
        ar: "بناء قائمة الطعام (أصناف، وجبات، إضافات)",
      },
      required: true,
    },
    {
      id: "ingredients",
      title: { en: "Ingredient stock with expiry", ar: "مخزون المكونات مع الصلاحية" },
      required: true,
    },
    {
      id: "suppliers",
      title: { en: "Suppliers & opening stock", ar: "الموردون والمخزون الافتتاحي" },
      required: true,
    },
    {
      id: "terminals",
      title: { en: "Terminals & floor plan", ar: "تهيئة الأجهزة وخريطة الطاولات" },
      required: true,
      feature_key: "pos.table_service",
    },
    {
      id: "first_day",
      title: { en: "Run first service day and Z close", ar: "تشغيل أول يوم خدمة والإغلاق اليومي" },
      required: false,
      feature_key: "pos.sales",
    },
  ],
  capability_prerequisites: {
    table_service: {
      level: "REQUIRED",
      feature_keys: ["pos.table_service"],
      available_from_phase: "PHASE-016",
    },
    barcode_pos: {
      level: "REQUIRED",
      feature_keys: ["pos.terminals", "pos.sales", "pos.offline_queue", "pos.receipts"],
      available_from_phase: "PHASE-016",
    },
    cashier_shifts: {
      level: "REQUIRED",
      feature_keys: ["treasury.cashier_shifts"],
      available_from_phase: "PHASE-016",
    },
    composite_kits: {
      level: "REQUIRED",
      feature_keys: ["items.composite_products"],
      available_from_phase: "PHASE-016",
    },
    expiry_tracking_fefo: {
      level: "REQUIRED",
      feature_keys: ["inventory.batch_tracking"],
      available_from_phase: "PHASE-010",
    },
    kitchen_display: {
      level: "OPTIONAL",
      feature_keys: ["pos.kitchen_display"],
      available_from_phase: "PHASE-016",
    },
    bom_production: {
      level: "OPTIONAL",
      feature_keys: ["manufacturing.bom", "manufacturing.production_orders"],
      available_from_phase: "PHASE-018",
    },
    free_goods_promo: {
      level: "OPTIONAL",
      feature_keys: ["distribution.free_goods"],
      available_from_phase: "PHASE-017",
    },
  },
});

/**
 * Automotive & Workshop v1.0.0 (PHASE-017) — parts counter + repair workshop
 * on one core: every vehicle is a customer asset, every repair is a job card
 * (parts + labor). Transcribed VERBATIM from the migration 0025 registry seed
 * (`industry_templates` row `industry.automotive`) — the seed is canonical.
 */
export const AUTOMOTIVE_TEMPLATE_MANIFEST: IndustryTemplateManifest = deepFreeze({
  id: "industry.automotive",
  name: "Automotive & Workshop",
  name_ar: "قطع الغيار والورش",
  version: "1.0.0",
  required_feature_keys: [
    "industry.template_engine",
    "items.barcodes",
    "items.price_lists",
    "inventory.multi_warehouse",
    "inventory.serial_tracking",
    "inventory.reservations",
    "sales.quotations",
    "sales.job_cards",
    "sales.reps",
    "treasury.cashier_shifts",
  ],
  default_modules_enabled: [
    "accounting",
    "partners",
    "items",
    "inventory",
    "sales",
    "purchasing",
    "treasury",
    "tax",
    "reporting",
    "configuration",
  ],
  terminology_overrides: {
    "svc.job_card": { en: "Job card", ar: "بطاقة عمل" },
    "fleet.vehicle": { en: "Vehicle", ar: "المركبة" },
    "svc.labor": { en: "Labor", ar: "أجور العمل" },
    "vehicle.make": { en: "Make", ar: "الصانع" },
    "vehicle.model": { en: "Model", ar: "الطراز" },
    "vehicle.chassis_no": { en: "Chassis number (VIN)", ar: "رقم الهيكل" },
    "vehicle.odometer": { en: "Odometer", ar: "عداد المسافة" },
    "svc.diagnosis": { en: "Diagnosis", ar: "الفحص والتشخيص" },
    "svc.technician": { en: "Technician", ar: "الفني" },
    "svc.service_history": { en: "Service history", ar: "سجل الصيانة" },
    "part.warranty": { en: "Parts warranty", ar: "ضمان قطع الغيار" },
  },
  navigation_manifest: {
    groups: [
      {
        id: "workshop",
        label: { en: "Workshop", ar: "الورشة" },
        order: 1,
        items: [
          {
            id: "job_cards",
            label: { en: "Job cards", ar: "بطاقات العمل" },
            target: "sales.job_cards",
          },
          {
            id: "vehicles",
            label: { en: "Vehicles", ar: "المركبات" },
            target: "partners.vehicles",
          },
          {
            id: "quotes",
            label: { en: "Diagnosis quotes", ar: "عروض التشخيص" },
            target: "sales.quotations",
          },
        ],
      },
      {
        id: "parts",
        label: { en: "Parts", ar: "قطع الغيار" },
        order: 2,
        items: [
          {
            id: "parts_stock",
            label: { en: "Parts stock", ar: "مخزون القطع" },
            target: "inventory.on_hand",
          },
          {
            id: "purchasing",
            label: { en: "Parts purchasing", ar: "شراء القطع" },
            target: "purchasing.orders",
          },
          {
            id: "counter",
            label: { en: "Counter sale", ar: "بيع الكاونتر" },
            target: "pos.counter",
            feature_key: "pos.sales",
          },
        ],
      },
    ],
  },
  workflow_policies: {
    job_card_parts_issue_mode: "reserve",
    job_card_labor_rate_source: "price_list",
    quotation_validity_days: 7,
    invoice_approval_required_over: 0,
    warranty_credit_note_requires_original_invoice: true,
    shift_variance_approval_required: true,
  },
  document_numbering_defaults: {
    job_card: {
      prefix: "JC",
      format: "JC-{yyyy}-{seq:5}",
      per_branch: true,
      reserve_on_approval: false,
    },
    quotation: {
      prefix: "QT",
      format: "QT-{yyyy}-{seq:5}",
      per_branch: false,
      reserve_on_approval: false,
    },
    sales_invoice: {
      prefix: "INV",
      format: "INV-{yyyy}-{seq:6}",
      per_branch: false,
      reserve_on_approval: false,
    },
    credit_note: {
      prefix: "CN",
      format: "CN-{yyyy}-{seq:5}",
      per_branch: false,
      reserve_on_approval: false,
    },
    purchase_order: {
      prefix: "PO",
      format: "PO-{yyyy}-{seq:5}",
      per_branch: false,
      reserve_on_approval: true,
    },
  },
  inventory_policy_defaults: {
    costing_method: "WAC",
    default_track_batch: false,
    default_track_expiry: false,
    default_track_serial: false,
    default_imei_tracking: false,
    fefo_picking: false,
    allow_negative_stock: false,
  },
  report_defaults: [
    {
      report_key: "automotive.job_card_profitability",
      pinned: true,
      dashboard: true,
      default_period: "this_month",
    },
    {
      report_key: "automotive.vehicle_service_history",
      pinned: true,
      dashboard: false,
      default_period: "custom",
    },
    {
      report_key: "inventory.valuation",
      pinned: true,
      dashboard: false,
      default_period: "custom",
    },
    {
      report_key: "ar.aging",
      pinned: true,
      dashboard: false,
      default_period: "this_month",
    },
  ],
  onboarding_steps: [
    {
      id: "branch_bays",
      title: { en: "Branch, workshop & bays", ar: "الفرع والورشة والمواقف" },
      required: true,
    },
    {
      id: "coa_confirm",
      title: {
        en: "Confirm chart of accounts (parts vs labor revenue)",
        ar: "تأكيد دليل الحسابات (إيراد القطع مقابل أجور العمل)",
      },
      required: true,
    },
    {
      id: "labor_rates",
      title: { en: "Labor rate price lists", ar: "قوائم أسعار أجور العمل" },
      required: true,
    },
    {
      id: "parts_catalog",
      title: { en: "Parts catalog & suppliers", ar: "كتالوج القطع والموردون" },
      required: true,
    },
    {
      id: "opening_stock",
      title: { en: "Opening parts stock", ar: "رصيد القطع الافتتاحي" },
      required: true,
    },
    {
      id: "vehicles",
      title: { en: "Import customer vehicles", ar: "استيراد مركبات العملاء" },
      required: false,
    },
    {
      id: "first_job",
      title: { en: "Run a first job card end-to-end", ar: "تنفيذ أول بطاقة عمل كاملة" },
      required: false,
    },
  ],
  capability_prerequisites: {
    job_cards: {
      level: "REQUIRED",
      feature_keys: ["sales.job_cards"],
      available_from_phase: "PHASE-017",
    },
    commissions: {
      level: "OPTIONAL",
      feature_keys: ["sales.commissions"],
      available_from_phase: "PHASE-017",
    },
    barcode_pos: {
      level: "OPTIONAL",
      feature_keys: ["pos.terminals", "pos.sales", "pos.receipts"],
      available_from_phase: "PHASE-016",
    },
    service_contracts: {
      level: "OPTIONAL",
      feature_keys: ["crm.service_contracts"],
      available_from_phase: "PHASE-019",
    },
    landed_costs: {
      level: "OPTIONAL",
      feature_keys: ["purchasing.landed_costs"],
      available_from_phase: "PHASE-011",
    },
    qc_inspections: {
      level: "OPTIONAL",
      feature_keys: ["manufacturing.qc"],
      available_from_phase: "PHASE-018",
    },
  },
});

/**
 * Distribution & Field Sales v1.0.0 (PHASE-017) — van sales: stock on
 * wheels, planned routes, rep accountability, and the hard day-end rep
 * settlement. Transcribed VERBATIM from the migration 0025 registry seed
 * (`industry_templates` row `industry.distribution`) — the seed is canonical.
 */
export const DISTRIBUTION_TEMPLATE_MANIFEST: IndustryTemplateManifest = deepFreeze({
  id: "industry.distribution",
  name: "Distribution & Field Sales",
  name_ar: "التوزيع والمبيعات الميدانية",
  version: "1.0.0",
  required_feature_keys: [
    "industry.template_engine",
    "distribution.routes",
    "distribution.van_stock",
    "distribution.settlements",
    "treasury.receipts_disbursements",
    "distribution.customer_tiers",
    "sales.discount_management",
    "sales.reps",
    "sales.commissions",
    "inventory.multi_warehouse",
    "inventory.stock_transfers",
    "inventory.batch_tracking",
    "treasury.cashier_shifts",
  ],
  default_modules_enabled: [
    "accounting",
    "partners",
    "items",
    "inventory",
    "sales",
    "purchasing",
    "treasury",
    "tax",
    "reporting",
    "distribution",
    "configuration",
  ],
  terminology_overrides: {
    "route.route": { en: "Route", ar: "خط السير" },
    "route.visit": { en: "Visit", ar: "الزيارة" },
    "van.van_stock": { en: "Van stock", ar: "مخزون السيارة" },
    "van.load_out": { en: "Load-out", ar: "التحميل الصباحي" },
    "van.unload": { en: "Evening unload", ar: "التنزيل المسائي" },
    "settlement.rep_settlement": { en: "Rep settlement", ar: "تسوية المندوب" },
    "settlement.variance": { en: "Cash variance", ar: "فرق الصندوق" },
    "billing.collection": { en: "Collection", ar: "التحصيل" },
    "price.tier": { en: "Customer tier", ar: "فئة العميل" },
    "promo.free_goods": { en: "Free goods", ar: "بضاعة مجانية" },
    "hr.field_rep": { en: "Sales rep (van)", ar: "مندوب التوزيع" },
  },
  navigation_manifest: {
    groups: [
      {
        id: "field",
        label: { en: "Field operations", ar: "العمليات الميدانية" },
        order: 1,
        items: [
          {
            id: "routes",
            label: { en: "Routes & visits", ar: "خطوط السير والزيارات" },
            target: "distribution.routes",
          },
          {
            id: "van_stock",
            label: { en: "Van stock", ar: "مخزون السيارة" },
            target: "distribution.van_stock",
          },
          {
            id: "collections",
            label: { en: "Collections", ar: "التحصيل" },
            target: "distribution.collections",
          },
        ],
      },
      {
        id: "settle",
        label: { en: "Settlements", ar: "التسويات" },
        order: 2,
        items: [
          {
            id: "rep_settlements",
            label: { en: "Rep settlements", ar: "تسويات المندوبين" },
            target: "distribution.settlements",
          },
          {
            id: "commissions",
            label: { en: "Commissions", ar: "العمولات" },
            target: "sales.commissions",
          },
        ],
      },
    ],
  },
  workflow_policies: {
    van_loadout_requires_transfer: true,
    settlement_required_daily: true,
    settlement_variance_approval_required: true,
    collection_receipt_at_visit: true,
    tier_price_automatic_by_partner: true,
    credit_sale_credit_limit_enforced: true,
    free_goods_require_reason_code: true,
  },
  document_numbering_defaults: {
    stock_transfer: {
      prefix: "LOD",
      format: "LOD-{yyyy}-{seq:5}",
      per_branch: false,
      reserve_on_approval: false,
    },
    sales_invoice: {
      prefix: "INV",
      format: "INV-{yyyy}-{seq:6}",
      per_branch: false,
      reserve_on_approval: false,
    },
    credit_note: {
      prefix: "CN",
      format: "CN-{yyyy}-{seq:5}",
      per_branch: false,
      reserve_on_approval: false,
    },
    receipt: {
      prefix: "RCP",
      format: "RCP-{yyyy}-{seq:6}",
      per_branch: false,
      reserve_on_approval: false,
    },
    settlement: {
      prefix: "STL",
      format: "STL-{yyyy}-{seq:5}",
      per_branch: false,
      reserve_on_approval: false,
    },
  },
  inventory_policy_defaults: {
    costing_method: "WAC",
    default_track_batch: true,
    default_track_expiry: true,
    default_track_serial: false,
    default_imei_tracking: false,
    fefo_picking: true,
    allow_negative_stock: false,
  },
  report_defaults: [
    {
      report_key: "distribution.rep_settlement",
      pinned: true,
      dashboard: true,
      default_period: "this_week",
    },
    {
      report_key: "distribution.van_stock_balances",
      pinned: true,
      dashboard: true,
      default_period: "today",
    },
    {
      report_key: "distribution.route_visit_compliance",
      pinned: true,
      dashboard: true,
      default_period: "this_month",
    },
    {
      report_key: "sales.discount_management_effectiveness",
      pinned: true,
      dashboard: false,
      default_period: "this_month",
    },
    {
      report_key: "sales.commissions_due",
      pinned: true,
      dashboard: false,
      default_period: "this_month",
    },
  ],
  onboarding_steps: [
    {
      id: "main_warehouse",
      title: { en: "Main warehouse & van fleet", ar: "المستودع الرئيسي وأسطول السيارات" },
      required: true,
    },
    {
      id: "coa_confirm",
      title: {
        en: "Confirm chart of accounts (rep cash account)",
        ar: "تأكيد دليل الحسابات (حساب نقديات المندوب)",
      },
      required: true,
    },
    {
      id: "reps_vans",
      title: {
        en: "Create reps, vans & assign routes",
        ar: "إنشاء المندوبين والسيارات وإسناد خطوط السير",
      },
      required: true,
    },
    {
      id: "tiers",
      title: { en: "Customer tiers & price lists", ar: "فئات العملاء وقوائم الأسعار" },
      required: true,
    },
    {
      id: "customers",
      title: { en: "Route customers with credit terms", ar: "عملاء الخطوط وشروط الدفع" },
      required: true,
    },
    {
      id: "opening_stock",
      title: { en: "Opening stock with batches", ar: "المخزون الافتتاحي مع الدفعات" },
      required: true,
    },
    {
      id: "first_day",
      title: {
        en: "Run first load-out → visits → settlement",
        ar: "تنفيذ أول يوم: تحميل، زيارات، تسوية",
      },
      required: false,
    },
  ],
  capability_prerequisites: {
    van_stock: {
      level: "REQUIRED",
      feature_keys: ["distribution.van_stock"],
      available_from_phase: "PHASE-017",
    },
    route_planning: {
      level: "REQUIRED",
      feature_keys: ["distribution.routes"],
      available_from_phase: "PHASE-017",
    },
    field_collections: {
      level: "REQUIRED",
      feature_keys: ["treasury.receipts_disbursements"],
      available_from_phase: "PHASE-017",
    },
    customer_price_tiers: {
      level: "REQUIRED",
      feature_keys: ["distribution.customer_tiers"],
      available_from_phase: "PHASE-017",
    },
    free_goods_promo: {
      level: "REQUIRED",
      feature_keys: ["sales.discount_management", "distribution.free_goods"],
      available_from_phase: "PHASE-017",
    },
    commissions: {
      level: "REQUIRED",
      feature_keys: ["sales.commissions"],
      available_from_phase: "PHASE-017",
    },
    cashier_shifts: {
      level: "REQUIRED",
      feature_keys: ["treasury.cashier_shifts"],
      available_from_phase: "PHASE-016",
    },
    expiry_tracking_fefo: {
      level: "REQUIRED",
      feature_keys: ["inventory.batch_tracking"],
      available_from_phase: "PHASE-010",
    },
    landed_costs: {
      level: "OPTIONAL",
      feature_keys: ["purchasing.landed_costs"],
      available_from_phase: "PHASE-011",
    },
  },
});

/**
 * Food Manufacturing v1.0.0 (PHASE-018) — recipes (BOMs) with yield, batch
 * production orders with QC quarantine + genealogy, and expiry-controlled
 * finished goods: every batch is traceable upstream to its materials and
 * downstream to its sales. Transcribed VERBATIM from the migration 0026
 * registry seed (`industry_templates` row `industry.food_manufacturing`;
 * the canonical source is
 * docs/industries/templates/manifests/manifest.food_manufacturing.json).
 */
export const FOOD_MANUFACTURING_TEMPLATE_MANIFEST: IndustryTemplateManifest = deepFreeze({
  id: "industry.food_manufacturing",
  name: "Food Manufacturing",
  name_ar: "التصنيع الغذائي",
  version: "1.0.0",
  required_feature_keys: [
    "industry.template_engine",
    "manufacturing.bom",
    "manufacturing.production_orders",
    "manufacturing.qc",
    "manufacturing.batch_genealogy",
    "inventory.multi_warehouse",
    "inventory.batch_tracking",
    "inventory.stock_counts",
    "items.price_lists",
    "purchasing.landed_costs",
  ],
  default_modules_enabled: [
    "accounting",
    "partners",
    "items",
    "inventory",
    "sales",
    "purchasing",
    "treasury",
    "tax",
    "reporting",
    "manufacturing",
    "configuration",
  ],
  terminology_overrides: {
    "mfg.recipe": { en: "Recipe (BOM)", ar: "الوصفة (قائمة المواد)" },
    "mfg.production_order": { en: "Production order", ar: "أمر الإنتاج" },
    "mfg.yield": { en: "Yield", ar: "المردود" },
    "mfg.scrap": { en: "Scrap", ar: "الهالك" },
    "mfg.qc_gate": { en: "QC gate", ar: "بوابة فحص الجودة" },
    "mfg.batch_genealogy": { en: "Batch genealogy", ar: "شجرة الدفعات" },
    "mfg.semi_finished": { en: "Semi-finished", ar: "نصف مصنّع" },
    "item.shelf_life": { en: "Shelf life (days)", ar: "مدة الصلاحية (أيام)" },
    "mfg.production_line": { en: "Production line", ar: "خط الإنتاج" },
  },
  navigation_manifest: {
    groups: [
      {
        id: "production",
        label: { en: "Production", ar: "الإنتاج" },
        order: 1,
        items: [
          {
            id: "recipes",
            label: { en: "Recipes (BOM)", ar: "الوصفات (قائمة المواد)" },
            target: "manufacturing.bom",
          },
          {
            id: "orders",
            label: { en: "Production orders", ar: "أوامر الإنتاج" },
            target: "manufacturing.orders",
          },
          {
            id: "qc",
            label: { en: "QC inspections", ar: "فحوصات الجودة" },
            target: "manufacturing.qc",
          },
        ],
      },
      {
        id: "trace",
        label: { en: "Traceability", ar: "التتبع" },
        order: 2,
        items: [
          {
            id: "genealogy",
            label: { en: "Batch genealogy", ar: "شجرة الدفعات" },
            target: "manufacturing.genealogy",
          },
          {
            id: "expiry",
            label: { en: "Expiry control", ar: "الرقابة على الصلاحية" },
            target: "inventory.expiry_list",
          },
        ],
      },
    ],
  },
  workflow_policies: {
    production_qc_gate: "required",
    fg_batch_expiry_from_shelf_life: true,
    scrap_reason_required: true,
    consumption_variance_threshold_pct: 5,
    expiry_writeoff_requires_approval: true,
    markdown_requires_approval: false,
  },
  document_numbering_defaults: {
    production_order: {
      prefix: "PRD",
      format: "PRD-{yyyy}-{seq:5}",
      per_branch: true,
      reserve_on_approval: true,
    },
    goods_receipt: {
      prefix: "GRN",
      format: "GRN-{yyyy}-{seq:6}",
      per_branch: false,
      reserve_on_approval: false,
    },
    sales_invoice: {
      prefix: "INV",
      format: "INV-{yyyy}-{seq:6}",
      per_branch: false,
      reserve_on_approval: false,
    },
    delivery_note: {
      prefix: "DLV",
      format: "DLV-{yyyy}-{seq:5}",
      per_branch: false,
      reserve_on_approval: false,
    },
    stock_adjustment: {
      prefix: "ADJ",
      format: "ADJ-{yyyy}-{seq:5}",
      per_branch: false,
      reserve_on_approval: false,
    },
  },
  inventory_policy_defaults: {
    costing_method: "WAC",
    default_track_batch: true,
    default_track_expiry: true,
    default_track_serial: false,
    default_imei_tracking: false,
    fefo_picking: true,
    allow_negative_stock: false,
  },
  report_defaults: [
    {
      report_key: "manufacturing.production_cost",
      pinned: true,
      dashboard: true,
      default_period: "this_month",
    },
    {
      report_key: "manufacturing.batch_genealogy",
      pinned: true,
      dashboard: false,
      default_period: "custom",
    },
    {
      report_key: "manufacturing.qc_inspection_log",
      pinned: true,
      dashboard: false,
      default_period: "this_month",
    },
    {
      report_key: "inventory.expiry_list",
      pinned: true,
      dashboard: true,
      default_period: "this_week",
    },
    {
      report_key: "grocery.expiry_writeoff",
      pinned: true,
      dashboard: false,
      default_period: "this_month",
    },
  ],
  onboarding_steps: [
    {
      id: "warehouses",
      title: {
        en: "Raw materials, WIP and finished-goods warehouses",
        ar: "مستودعات المواد الخام والتشغيل والإنتاج التام",
      },
      required: true,
    },
    {
      id: "coa_confirm",
      title: {
        en: "Confirm chart of accounts (WIP, scrap accounts)",
        ar: "تأكيد دليل الحسابات (حسابات تحت التشغيل والهالك)",
      },
      required: true,
    },
    {
      id: "recipes",
      title: { en: "Recipes with yield", ar: "الوصفات مع المردود" },
      required: true,
    },
    {
      id: "materials",
      title: { en: "Materials with batches & suppliers", ar: "المواد مع الدفعات والموردون" },
      required: true,
    },
    {
      id: "fg_shelf_life",
      title: { en: "Finished goods & shelf-life defaults", ar: "المنتجات التامة ومدد الصلاحية" },
      required: true,
    },
    {
      id: "first_run",
      title: { en: "Run first production order end-to-end", ar: "تنفيذ أول أمر إنتاج كامل" },
      required: false,
    },
    {
      id: "outlet",
      title: { en: "Optional factory outlet counter", ar: "كاونتر منفذ بيع المصنع (اختياري)" },
      required: false,
      feature_key: "pos.sales",
    },
  ],
  capability_prerequisites: {
    bom_production: {
      level: "REQUIRED",
      feature_keys: ["manufacturing.bom", "manufacturing.production_orders"],
      available_from_phase: "PHASE-018",
    },
    qc_inspections: {
      level: "REQUIRED",
      feature_keys: ["manufacturing.qc"],
      available_from_phase: "PHASE-018",
    },
    batch_genealogy: {
      level: "REQUIRED",
      feature_keys: ["manufacturing.batch_genealogy"],
      available_from_phase: "PHASE-018",
    },
    expiry_tracking_fefo: {
      level: "REQUIRED",
      feature_keys: ["inventory.batch_tracking"],
      available_from_phase: "PHASE-010",
    },
    landed_costs: {
      level: "REQUIRED",
      feature_keys: ["purchasing.landed_costs"],
      available_from_phase: "PHASE-011",
    },
    barcode_pos: {
      level: "OPTIONAL",
      feature_keys: ["pos.terminals", "pos.sales", "pos.receipts"],
      available_from_phase: "PHASE-016",
    },
    cashier_shifts: {
      level: "OPTIONAL",
      feature_keys: ["treasury.cashier_shifts"],
      available_from_phase: "PHASE-016",
    },
    customer_price_tiers: {
      level: "OPTIONAL",
      feature_keys: ["distribution.customer_tiers"],
      available_from_phase: "PHASE-017",
    },
  },
});

/** Every manifest shipped by this build — the CI validation set (§8). */
export const SHIPPED_TEMPLATE_MANIFESTS: readonly IndustryTemplateManifest[] = Object.freeze([
  RETAIL_MANIFEST,
  GROCERY_MANIFEST,
  RESTAURANT_MANIFEST,
  AUTOMOTIVE_TEMPLATE_MANIFEST,
  DISTRIBUTION_TEMPLATE_MANIFEST,
  FOOD_MANUFACTURING_TEMPLATE_MANIFEST,
]);
