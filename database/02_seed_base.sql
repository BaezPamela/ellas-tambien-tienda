-- Datos iniciales: categorías y costos de envío por provincia.
-- Los costos de envío son de ejemplo: ajustalos desde el panel (paquete 3) o acá.
-- Seleccioná la base antes de ejecutar: USE ellas_tambien;

INSERT IGNORE INTO categories (name, slug, sort_order) VALUES
  ('Remeras', 'remeras', 1),
  ('Jeans y pantalones', 'jeans-y-pantalones', 2),
  ('Vestidos', 'vestidos', 3),
  ('Abrigos', 'abrigos', 4),
  ('Accesorios', 'accesorios', 5);

INSERT IGNORE INTO shipping_rates (province, cost, days_min, days_max) VALUES
  ('Santa Fe', 3500, 2, 4),
  ('Córdoba', 5500, 3, 5),
  ('Entre Ríos', 5500, 3, 5),
  ('Buenos Aires', 5500, 3, 5),
  ('Ciudad Autónoma de Buenos Aires', 5500, 3, 5),
  ('La Pampa', 7500, 4, 7),
  ('San Luis', 7500, 4, 7),
  ('Santiago del Estero', 7500, 4, 7),
  ('Corrientes', 7500, 4, 7),
  ('Misiones', 8500, 5, 8),
  ('Chaco', 8500, 5, 8),
  ('Formosa', 8500, 5, 8),
  ('Tucumán', 8500, 4, 7),
  ('Catamarca', 8500, 5, 8),
  ('La Rioja', 8500, 5, 8),
  ('Salta', 9000, 5, 8),
  ('Jujuy', 9000, 5, 8),
  ('Mendoza', 8500, 4, 7),
  ('San Juan', 8500, 4, 7),
  ('Neuquén', 9500, 5, 9),
  ('Río Negro', 9500, 5, 9),
  ('Chubut', 10500, 6, 10),
  ('Santa Cruz', 11500, 7, 12),
  ('Tierra del Fuego', 12500, 7, 12);
