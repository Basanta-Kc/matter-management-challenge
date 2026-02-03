import { MatterRepo } from '../repo/matter_repo.js';
import { CycleTimeService } from './cycle_time_service.js';
import { Matter, MatterListParams, MatterListResponseOptimized, StatusValue, CurrencyValue, UserValue } from '../../types.js';

export class MatterService {
  private matterRepo: MatterRepo;
  private cycleTimeService: CycleTimeService;

  constructor() {
    this.matterRepo = new MatterRepo();
    this.cycleTimeService = new CycleTimeService();
  }

  async getMatters(params: MatterListParams): Promise<MatterListResponseOptimized> {
    const { page = 1, limit = 25 } = params;
    const { matters, total } = await this.matterRepo.getMatters(params);

    const totalPages = Math.ceil(total / limit);

    // Optimize response by sending only display values
    const optimizedData = matters.map(matter => ({
      id: matter.id,
      boardId: matter.boardId,
      fields: Object.entries(matter.fields).reduce((acc, [key, field]) => {
        // Send only the displayValue or actual value, not the entire field object
        if (field.displayValue !== undefined) {
          acc[key] = field.displayValue;
        } else if (field.value !== null && typeof field.value === 'object') {
          // For complex types, use displayValue or stringify
          if ('displayName' in field.value) {
            acc[key] = field.value.displayName;
          } else if ('amount' in field.value && 'currency' in field.value) {
            acc[key] = `${field.value.amount.toLocaleString()} ${field.value.currency}`;
          } else {
            acc[key] = String(field.value);
          }
        } else {
          acc[key] = field.value;
        }
        return acc;
      }, {} as Record<string, string | number | boolean | null>),
      resolutionTime: matter.cycleTime?.resolutionTimeFormatted || null,
      sla: matter.sla,
      createdAt: matter.createdAt,
      updatedAt: matter.updatedAt,
    }));

    return {
      data: optimizedData,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async getMatterById(matterId: string): Promise<Matter | null> {
    const matter = await this.matterRepo.getMatterById(matterId);
    
    if (!matter) {
      return null;
    }

    const statusField = matter.fields['Status'];
    let statusGroupName: string | null = null;
    
    if (statusField && statusField.value && typeof statusField.value === 'object') {
      statusGroupName = (statusField.value as StatusValue).groupName || null;
    }

    
    const { cycleTime, sla } = (await this.cycleTimeService.calculateCycleTimesAndSLA(
      [
        {
          ticketId: matter.id,
          currentStatusGroupName: statusGroupName,
        },
      ],
    ))[matter.id];

    return {
      ...matter,
      cycleTime,
      sla
    };
  }

  async updateMatter(
    matterId: string,
    fieldId: string,
    fieldType: string,
    value: string | number | boolean | Date | CurrencyValue | UserValue | StatusValue | null,
    userId: number,
  ): Promise<void> {
    await this.matterRepo.updateMatterField(matterId, fieldId, fieldType, value, userId);
  }
}

export default MatterService;

