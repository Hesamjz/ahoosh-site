// Retired route: /markets -> hard 404.
import { gone } from './_notfound.js';
export const onRequest = () => gone();
