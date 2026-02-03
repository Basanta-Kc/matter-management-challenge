import { Router } from 'express';
import { getMatters } from './handlers/getMatters.js';
import { getMatterDetails } from './handlers/getMatterDetails.js';
import { updateMatter } from './handlers/updateMatter.js';
import { getFields } from './handlers/getFields.js';
import { validate } from '../../middleware/validate.js';
import {
  getMattersQuerySchema,
  matterIdParamsSchema,
  updateMatterBodySchema,
} from './validation.js';

export const matterRouter = Router();

matterRouter.get(
  '/matters',
  validate({ query: getMattersQuerySchema }),
  getMatters
);

matterRouter.get(
  '/matters/:id',
  validate({ params: matterIdParamsSchema }),
  getMatterDetails
);

matterRouter.patch(
  '/matters/:id',
  validate({
    params: matterIdParamsSchema,
    body: updateMatterBodySchema,
  }),
  updateMatter
);

// Fields endpoint
matterRouter.get('/fields', getFields);

export default matterRouter;

