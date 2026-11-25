export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_ENV?: string;
  /** Código de emparejamiento elegido por el usuario (GitHub Secret → Worker secret). */
  SETUP_CODE?: string;
  BESTBUY_API_KEY?: string;
  EBAY_CLIENT_ID?: string;
  EBAY_CLIENT_SECRET?: string;
  /** Solo si el usuario autoriza la fuente de descubrimiento. */
  SERPAPI_KEY?: string;
}
