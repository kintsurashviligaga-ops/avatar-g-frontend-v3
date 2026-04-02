'use client';

import { useGlobalStore } from '@/lib/store';
import { checkCreditAvailability, deductCredits, getCreditCost } from '@/lib/monetization/credits';
import { ToolName } from '@/lib/ai/tools';

export function useCredits() {
  const { credits, setCredits } = useGlobalStore();

  const canExecuteTool = (toolName: ToolName): boolean => {
    return checkCreditAvailability(credits, toolName);
  };

  const getCost = (toolName: ToolName): number => {
    return getCreditCost(toolName);
  };

  const executeWithCreditDeduction = async (
    toolName: ToolName,
    handler: () => Promise<any>
  ): Promise<{ success: boolean; error?: string; result?: any }> => {
    if (!canExecuteTool(toolName)) {
      const cost = getCost(toolName);
      return {
        success: false,
        error: `Insufficient credits. Need ${cost}, have ${credits}. Upgrade your plan to continue.`,
      };
    }

    try {
      const result = await handler();
      const { remainingCredits } = deductCredits(credits, toolName);
      setCredits(remainingCredits);
      return { success: true, result };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  };

  return {
    credits,
    canExecuteTool,
    getCost,
    executeWithCreditDeduction,
  };
}
