import { Request, Response } from 'express';
import { MatterService } from '../service/matter_service.js';
import { AppError } from '../../../middleware/errorHandler.js';

export async function getMatterDetails(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  const matterService = new MatterService();
  const matter = await matterService.getMatterById(id);

  if (!matter) {
    throw new AppError(404, 'Matter not found');
  }

  res.json(matter);
}

