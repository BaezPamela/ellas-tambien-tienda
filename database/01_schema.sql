-- ============================================================
-- Ellas También · Tienda online
-- Esquema de base de datos para MySQL 8.x
--
-- Cómo usarlo en MySQL Workbench:
--   1. Conectate a tu servidor y abrí este archivo (File > Open SQL Script).
--   2. Ejecutalo completo con el rayo (Ctrl+Shift+Enter).
--   3. Después ejecutá 02_seed_base.sql y, si querés prendas de ejemplo, 03_seed_demo_products.sql.
--
-- En Railway la base ya existe: saltá las dos primeras sentencias
-- (CREATE DATABASE y USE) y ejecutá el resto sobre la base que te dieron.
-- ============================================================

CREATE DATABASE IF NOT EXISTS ellas_tambien
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ellas_tambien;

-- Datos del local editables desde el panel (nombre, WhatsApp, horarios, cuenta bancaria, etc.)
CREATE TABLE IF NOT EXISTS settings (
  setting_key   VARCHAR(60) NOT NULL PRIMARY KEY,
  setting_value TEXT NULL
) ENGINE=InnoDB;

-- Usuarios del panel. En el paquete 3 puede haber varios (dueño y vendedores).
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(80)  NOT NULL,
  email         VARCHAR(120) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  role          ENUM('owner','seller') NOT NULL DEFAULT 'seller',
  active        TINYINT(1) NOT NULL DEFAULT 1,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS categories (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(80) NOT NULL,
  slug       VARCHAR(100) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_categories_slug (slug)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS products (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  category_id   INT UNSIGNED NOT NULL,
  name          VARCHAR(140) NOT NULL,
  slug          VARCHAR(160) NOT NULL,
  description   TEXT NULL,
  composition   VARCHAR(255) NULL,
  price         INT UNSIGNED NOT NULL,          -- en pesos, sin decimales
  compare_price INT UNSIGNED NULL,              -- precio anterior (tachado), opcional
  featured      TINYINT(1) NOT NULL DEFAULT 0,
  active        TINYINT(1) NOT NULL DEFAULT 1,  -- 0 = archivada, no se muestra en la tienda
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_products_slug (slug),
  KEY idx_products_category (category_id, active),
  CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS product_colors (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id INT UNSIGNED NOT NULL,
  name       VARCHAR(40) NOT NULL,
  hex        CHAR(7) NOT NULL DEFAULT '#CCCCCC',
  KEY idx_colors_product (product_id),
  CONSTRAINT fk_colors_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS product_images (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id INT UNSIGNED NOT NULL,
  color_id   INT UNSIGNED NULL,                 -- NULL = foto general de la prenda
  path       VARCHAR(255) NOT NULL,             -- imagen grande (WebP)
  thumb_path VARCHAR(255) NOT NULL,             -- miniatura (WebP)
  alt        VARCHAR(160) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  KEY idx_images_product (product_id, sort_order),
  CONSTRAINT fk_images_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
  CONSTRAINT fk_images_color   FOREIGN KEY (color_id)   REFERENCES product_colors (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Una fila por combinación color + talle. Acá vive el stock.
CREATE TABLE IF NOT EXISTS product_variants (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id INT UNSIGNED NOT NULL,
  color_id   INT UNSIGNED NOT NULL,
  size       VARCHAR(10) NOT NULL,
  stock      INT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_variant (product_id, color_id, size),
  CONSTRAINT fk_variants_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
  CONSTRAINT fk_variants_color   FOREIGN KEY (color_id)   REFERENCES product_colors (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Paquete 3: clientes que compraron y aceptaron recibir avisos.
CREATE TABLE IF NOT EXISTS customers (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name              VARCHAR(100) NOT NULL,
  phone             VARCHAR(30) NOT NULL,
  email             VARCHAR(120) NULL,
  accepts_marketing TINYINT(1) NOT NULL DEFAULT 0,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_order_at     DATETIME NULL,
  UNIQUE KEY uq_customers_phone (phone)
) ENGINE=InnoDB;

-- Paquete 3: costo de envío por provincia.
CREATE TABLE IF NOT EXISTS shipping_rates (
  id       INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  province VARCHAR(60) NOT NULL,
  cost     INT UNSIGNED NOT NULL DEFAULT 0,
  days_min TINYINT UNSIGNED NOT NULL DEFAULT 3,
  days_max TINYINT UNSIGNED NOT NULL DEFAULT 7,
  active   TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_rates_province (province)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS orders (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code            VARCHAR(12) NOT NULL,
  customer_id     INT UNSIGNED NULL,
  customer_name   VARCHAR(100) NOT NULL,
  phone           VARCHAR(30) NOT NULL,
  email           VARCHAR(120) NULL,
  delivery_method ENUM('retiro','envio') NOT NULL DEFAULT 'retiro',
  address         VARCHAR(200) NULL,
  city            VARCHAR(80) NULL,
  province        VARCHAR(60) NULL,
  postal_code     VARCHAR(12) NULL,
  subtotal        INT UNSIGNED NOT NULL,
  shipping_cost   INT UNSIGNED NOT NULL DEFAULT 0,
  total           INT UNSIGNED NOT NULL,
  payment_method  ENUM('transferencia','mercadopago','efectivo') NOT NULL,
  status          ENUM('pendiente','pagado','enviado','entregado','cancelado') NOT NULL DEFAULT 'pendiente',
  mp_payment_id   VARCHAR(40) NULL,
  notes           TEXT NULL,
  reserved_until  DATETIME NULL,                -- hasta cuándo se reserva el stock sin pago
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_orders_code (code),
  KEY idx_orders_status (status, created_at),
  KEY idx_orders_customer (customer_id),
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_items (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id     INT UNSIGNED NOT NULL,
  variant_id   INT UNSIGNED NULL,
  product_name VARCHAR(140) NOT NULL,
  color_name   VARCHAR(40) NOT NULL,
  size         VARCHAR(10) NOT NULL,
  unit_price   INT UNSIGNED NOT NULL,
  quantity     INT UNSIGNED NOT NULL,
  KEY idx_items_order (order_id),
  CONSTRAINT fk_items_order   FOREIGN KEY (order_id)   REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_items_variant FOREIGN KEY (variant_id) REFERENCES product_variants (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Ventas hechas en el mostrador ("Vendí en el local").
CREATE TABLE IF NOT EXISTS local_sales (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  variant_id INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NULL,
  quantity   INT UNSIGNED NOT NULL,
  unit_price INT UNSIGNED NOT NULL,
  total      INT UNSIGNED NOT NULL,
  voided     TINYINT(1) NOT NULL DEFAULT 0,
  voided_at  DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_sales_created (created_at),
  CONSTRAINT fk_sales_variant FOREIGN KEY (variant_id) REFERENCES product_variants (id),
  CONSTRAINT fk_sales_user    FOREIGN KEY (user_id)    REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Historial de cada cambio de stock: quién, cuándo y por qué.
CREATE TABLE IF NOT EXISTS stock_movements (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  variant_id INT UNSIGNED NOT NULL,
  delta      INT NOT NULL,
  reason     ENUM('venta_online','venta_local','anulacion_local','cancelacion_pedido','ajuste') NOT NULL,
  ref_id     INT UNSIGNED NULL,
  user_id    INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_movements_variant (variant_id, created_at),
  CONSTRAINT fk_movements_variant FOREIGN KEY (variant_id) REFERENCES product_variants (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Consultas del formulario de contacto y botón de arrepentimiento.
CREATE TABLE IF NOT EXISTS contact_messages (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  type       ENUM('consulta','arrepentimiento') NOT NULL DEFAULT 'consulta',
  name       VARCHAR(100) NOT NULL,
  email      VARCHAR(120) NULL,
  phone      VARCHAR(30) NULL,
  order_code VARCHAR(12) NULL,
  message    TEXT NULL,
  handled    TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_messages_handled (handled, created_at)
) ENGINE=InnoDB;
