import { Request, Response } from 'express';
import { MatterService } from '../service/matter_service.js';
import logger from '../../../utils/logger.js';

export async function getMatters(req: Request, res: Response): Promise<void> {
  try {
    // Validation is handled by middleware, params are already validated
    const params = req.query;
    
    const matterService = new MatterService();
    const result = await matterService.getMatters(params);

    res.json(result);
  } catch (error) {
    logger.error('Error fetching matters', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
}

