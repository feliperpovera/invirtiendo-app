/**
 * Enlaces de atribución de las APIs públicas (catálogo public-apis). Módulo sin dependencias
 * de servidor para que lo usen tanto los proveedores como los componentes del navegador.
 * XOOMAR exige citarlo con enlace a la página del dataset al republicar sus datos.
 */
export const FUENTE_URL = {
  xoomarShortInterest: "https://xoomar.com/markets/short-interest",
  xoomarMacro: "https://xoomar.com/markets/macro",
  wsb: "https://tradestie.com/apps/reddit/top-50-stocks-discussed-on-wallstreetbets/",
  fx: "https://github.com/fawazahmed0/exchange-api",
} as const;
