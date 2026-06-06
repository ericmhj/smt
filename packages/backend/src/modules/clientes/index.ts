export { clienteRoutes } from './cliente.routes.js';
export { documentoRoutes } from './documento.routes.js';
export { ClienteService } from './cliente.service.js';
export { DocumentoService } from './documento.service.js';
export { BusquedaService } from './busqueda.service.js';
export { ClienteError, ClienteErrorCode } from './cliente.errors.js';
export { DocumentoError, DocumentoErrorCode } from './documento.errors.js';
export { requireClientePermission } from './rbac.guard.js';
