-- Remove orphan activation pointing to non-existent template
DELETE FROM sgr_el_reloj.report_template_activations
WHERE report_template_id = 'b91e2088-858e-4c76-ae9e-fe4b789b455e';
