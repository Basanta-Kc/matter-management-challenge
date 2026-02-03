import { Request, Response } from 'express';
import { MatterService } from '../service/matter_service.js';

export async function getMatters(req: Request, res: Response): Promise<void> {
  const params = req.query;
  
  const matterService = new MatterService();
  const result = await matterService.getMatters(params);

  res.json(result);
}

