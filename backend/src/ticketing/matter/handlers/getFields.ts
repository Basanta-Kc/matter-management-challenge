import { Request, Response } from 'express';
import { FieldsRepo } from '../../fields/repo/fields_repo.js';

export async function getFields(_req: Request, res: Response) {
  // Default account ID (in production, this would come from authentication)
  const accountId = 1;

  const fieldsRepo = new FieldsRepo();
  const fields = await fieldsRepo.getAllFields(accountId);
  const statusGroups = await fieldsRepo.getStatusGroups(accountId);
  const currencyOptions = await fieldsRepo.getCurrencyOptions(accountId);

  res.json({
    fields,
    statusGroups,
    currencyOptions,
  });
}

