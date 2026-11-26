-- Prendas de EJEMPLO para ver la tienda funcionando. Sin fotos: se muestra una imagen genérica.
-- Cuando cargues las prendas reales desde el panel, archivá estas (botón "Archivar").
-- Ejecutar después de 02_seed_base.sql.

-- 1) Remera oversize
INSERT INTO products (category_id, name, slug, description, composition, price, featured)
VALUES ((SELECT id FROM categories WHERE slug = 'remeras'),
        'Remera oversize de algodón', 'remera-oversize-de-algodon',
        'Remera de corte amplio y caída suave. Se lleva sola o con jeans.',
        '100% algodón', 18900, 1);
SET @p1 = LAST_INSERT_ID();
INSERT INTO product_colors (product_id, name, hex) VALUES (@p1, 'Blanco', '#F1F1EC');
SET @c1 = LAST_INSERT_ID();
INSERT INTO product_colors (product_id, name, hex) VALUES (@p1, 'Negro', '#1C1D20');
SET @c2 = LAST_INSERT_ID();
INSERT INTO product_variants (product_id, color_id, size, stock) VALUES
  (@p1, @c1, 'S', 4), (@p1, @c1, 'M', 6), (@p1, @c1, 'L', 3), (@p1, @c1, 'XL', 1),
  (@p1, @c2, 'S', 5), (@p1, @c2, 'M', 8), (@p1, @c2, 'L', 4), (@p1, @c2, 'XL', 0);

-- 2) Jean mom
INSERT INTO products (category_id, name, slug, description, composition, price, featured)
VALUES ((SELECT id FROM categories WHERE slug = 'jeans-y-pantalones'),
        'Jean mom tiro alto', 'jean-mom-tiro-alto',
        'Jean de tiro alto y pierna recta, cómodo para todo el día.',
        '98% algodón, 2% elastano', 54900, 1);
SET @p2 = LAST_INSERT_ID();
INSERT INTO product_colors (product_id, name, hex) VALUES (@p2, 'Azul claro', '#8FB1D8');
SET @c3 = LAST_INSERT_ID();
INSERT INTO product_colors (product_id, name, hex) VALUES (@p2, 'Azul oscuro', '#27395F');
SET @c4 = LAST_INSERT_ID();
INSERT INTO product_variants (product_id, color_id, size, stock) VALUES
  (@p2, @c3, '36', 2), (@p2, @c3, '38', 5), (@p2, @c3, '40', 6), (@p2, @c3, '42', 3),
  (@p2, @c4, '36', 0), (@p2, @c4, '38', 3), (@p2, @c4, '40', 4), (@p2, @c4, '42', 2);

-- 3) Vestido midi
INSERT INTO products (category_id, name, slug, description, composition, price, compare_price, featured)
VALUES ((SELECT id FROM categories WHERE slug = 'vestidos'),
        'Vestido midi de lino', 'vestido-midi-de-lino',
        'Vestido midi fresco y liviano, ideal para la temporada de calor.',
        '55% lino, 45% viscosa', 62500, 69900, 1);
SET @p3 = LAST_INSERT_ID();
INSERT INTO product_colors (product_id, name, hex) VALUES (@p3, 'Ocre', '#C99B3E');
SET @c5 = LAST_INSERT_ID();
INSERT INTO product_colors (product_id, name, hex) VALUES (@p3, 'Oliva', '#5E6A3D');
SET @c6 = LAST_INSERT_ID();
INSERT INTO product_variants (product_id, color_id, size, stock) VALUES
  (@p3, @c5, 'S', 1), (@p3, @c5, 'M', 2), (@p3, @c5, 'L', 0),
  (@p3, @c6, 'S', 3), (@p3, @c6, 'M', 4), (@p3, @c6, 'L', 2);
