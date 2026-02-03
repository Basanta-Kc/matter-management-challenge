import { Request, Response } from 'express';
import { MatterService } from '../service/matter_service.js';

export async function updateMatter(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { fieldId, fieldType, value } = req.body;
  
  // Default user ID (in production, this would come from authentication)
  const userId = 1;

  const matterService = new MatterService();
  await matterService.updateMatter(id, fieldId, fieldType, value, userId);

  // Return updated matter
  const updatedMatter = await matterService.getMatterById(id);
  
  res.json(updatedMatter);
}

