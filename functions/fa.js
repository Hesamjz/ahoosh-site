// Retired route: /fa -> hard 404.
import { gone } from './_notfound.js';
export const onRequest = () => gone();
