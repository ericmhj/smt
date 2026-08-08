-- Fix theme for "Reporte Registro Aspirantes" using color #3B6D11 from its form
UPDATE sgr_el_reloj.report_template_activations
SET theme_config = '{"baseTheme":"personalizado","palette":{"primary":"#3B6D11","primaryLight":"#6ba33e","primaryDark":"#1f3a09","secondary":"#4a116d","accent":"#6d6b11","neutral":"#737b8c","background":"#fafcf8","text":"#1d2518"},"typography":{"fontFamily":"Plus Jakarta Sans, sans-serif","titleSize":14,"bodySize":11,"lineHeight":1.5},"layout":{"margins":"normal","headerStyle":"full","tableStyle":"bordered","separator":"line"},"branding":{"showLogo":true,"logoUrl":null,"logoPosition":"left","showWatermark":false,"watermarkText":null},"footer":{"showPageNumbers":true,"showDate":true,"customText":null}}'::jsonb
WHERE id = '7e998f9b-37af-4a05-b171-65769ad9e2e8';
