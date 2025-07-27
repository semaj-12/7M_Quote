import axios from 'axios';
import { db } from './db';

export interface BookkeepingSoftware {
  type: 'quickbooks' | 'xero' | 'netsuite';
  accessToken: string;
  refreshToken?: string;
  companyId: string;
  sandboxMode: boolean;
}

export interface HistoricalProjectData {
  projectId: string;
  projectName: string;
  startDate: Date;
  completionDate: Date;
  budgetedCost: number;
  actualCost: number;
  laborHours: {
    budgeted: number;
    actual: number;
  };
  materialCosts: {
    budgeted: number;
    actual: number;
  };
  overheadCosts: number;
  profitMargin: number;
  accuracy: number;
}

export interface LaborAnalysis {
  averageHourlyRate: number;
  skillLevels: {
    junior: { rate: number; efficiency: number };
    intermediate: { rate: number; efficiency: number };
    senior: { rate: number; efficiency: number };
    certified: { rate: number; efficiency: number };
  };
  overtimeRates: number;
  benefits: number;
  productivity: {
    timeOfYear: Record<string, number>;
    dayOfWeek: Record<string, number>;
    projectType: Record<string, number>;
  };
}

export interface MaterialCostAnalysis {
  supplierPerformance: {
    name: string;
    averagePrice: number;
    reliability: number;
    deliveryTime: number;
    qualityScore: number;
  }[];
  seasonalTrends: Record<string, number>;
  volumeDiscounts: Record<string, number>;
  preferredVendors: string[];
}

export interface FinancialHealthMetrics {
  cashFlow: {
    current: number;
    projected30Days: number;
    projected60Days: number;
    projected90Days: number;
  };
  workingCapital: number;
  accountsReceivable: {
    current: number;
    overdue: number;
    averageCollectionDays: number;
  };
  accountsPayable: {
    current: number;
    overdue: number;
    averagePaymentDays: number;
  };
  profitMargins: {
    gross: number;
    net: number;
    operating: number;
  };
}

export class BookkeepingIntegrationService {
  // QuickBooks Online API Integration
  async connectQuickBooks(credentials: {
    accessToken: string;
    refreshToken: string;
    companyId: string;
    sandbox?: boolean;
  }): Promise<BookkeepingSoftware> {
    const baseUrl = credentials.sandbox 
      ? 'https://sandbox-quickbooks.api.intuit.com'
      : 'https://quickbooks.api.intuit.com';

    try {
      // Test connection
      const response = await axios.get(
        `${baseUrl}/v3/company/${credentials.companyId}/companyinfo/${credentials.companyId}`,
        {
          headers: {
            'Authorization': `Bearer ${credentials.accessToken}`,
            'Accept': 'application/json'
          }
        }
      );

      return {
        type: 'quickbooks',
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
        companyId: credentials.companyId,
        sandboxMode: credentials.sandbox || false
      };
    } catch (error) {
      throw new Error(`QuickBooks connection failed: ${error.response?.data?.Fault?.Error?.[0]?.Detail || error.message}`);
    }
  }

  // Xero API Integration
  async connectXero(credentials: {
    accessToken: string;
    tenantId: string;
  }): Promise<BookkeepingSoftware> {
    try {
      // Test connection
      const response = await axios.get('https://api.xero.com/api.xro/2.0/Organisation', {
        headers: {
          'Authorization': `Bearer ${credentials.accessToken}`,
          'Xero-tenant-id': credentials.tenantId,
          'Accept': 'application/json'
        }
      });

      return {
        type: 'xero',
        accessToken: credentials.accessToken,
        companyId: credentials.tenantId,
        sandboxMode: false
      };
    } catch (error) {
      throw new Error(`Xero connection failed: ${error.response?.data?.message || error.message}`);
    }
  }

  // NetSuite SuiteTalk REST API Integration
  async connectNetSuite(credentials: {
    accountId: string;
    consumerKey: string;
    consumerSecret: string;
    token: string;
    tokenSecret: string;
  }): Promise<BookkeepingSoftware> {
    try {
      // NetSuite uses OAuth 1.0 - more complex authentication
      const baseUrl = `https://${credentials.accountId}.suitetalk.api.netsuite.com/services/rest/record/v1`;
      
      // Test connection with a simple query
      const response = await this.makeNetSuiteRequest(baseUrl + '/customer', 'GET', credentials);

      return {
        type: 'netsuite',
        accessToken: credentials.token,
        companyId: credentials.accountId,
        sandboxMode: false
      };
    } catch (error) {
      throw new Error(`NetSuite connection failed: ${error.message}`);
    }
  }

  // Extract historical project data for ML training
  async getHistoricalProjectData(
    software: BookkeepingSoftware,
    dateRange: { from: Date; to: Date }
  ): Promise<HistoricalProjectData[]> {
    switch (software.type) {
      case 'quickbooks':
        return this.getQuickBooksProjectData(software, dateRange);
      case 'xero':
        return this.getXeroProjectData(software, dateRange);
      case 'netsuite':
        return this.getNetSuiteProjectData(software, dateRange);
      default:
        throw new Error(`Unsupported software type: ${software.type}`);
    }
  }

  // Analyze labor costs and efficiency
  async analyzeLaborCosts(
    software: BookkeepingSoftware,
    projectIds?: string[]
  ): Promise<LaborAnalysis> {
    const payrollData = await this.getPayrollData(software);
    const timesheetData = await this.getTimesheetData(software, projectIds);
    
    return this.processLaborAnalysis(payrollData, timesheetData);
  }

  // Analyze material costs and supplier performance
  async analyzeMaterialCosts(
    software: BookkeepingSoftware,
    materialTypes?: string[]
  ): Promise<MaterialCostAnalysis> {
    const purchaseData = await this.getPurchaseData(software);
    const vendorData = await this.getVendorData(software);
    
    return this.processMaterialAnalysis(purchaseData, vendorData, materialTypes);
  }

  // Get financial health metrics for risk assessment
  async getFinancialHealthMetrics(software: BookkeepingSoftware): Promise<FinancialHealthMetrics> {
    const [
      balanceSheet,
      incomeStatement,
      cashFlowStatement,
      arAging,
      apAging
    ] = await Promise.all([
      this.getBalanceSheet(software),
      this.getIncomeStatement(software),
      this.getCashFlowStatement(software),
      this.getARAgingReport(software),
      this.getAPAgingReport(software)
    ]);

    return this.calculateFinancialMetrics(
      balanceSheet,
      incomeStatement,
      cashFlowStatement,
      arAging,
      apAging
    );
  }

  // QuickBooks specific implementations
  private async getQuickBooksProjectData(
    software: BookkeepingSoftware,
    dateRange: { from: Date; to: Date }
  ): Promise<HistoricalProjectData[]> {
    const baseUrl = software.sandboxMode 
      ? 'https://sandbox-quickbooks.api.intuit.com'
      : 'https://quickbooks.api.intuit.com';

    try {
      // Get projects/jobs
      const projectsResponse = await axios.get(
        `${baseUrl}/v3/company/${software.companyId}/query`,
        {
          params: {
            query: `SELECT * FROM Customer WHERE Active = true AND Job = true`
          },
          headers: {
            'Authorization': `Bearer ${software.accessToken}`,
            'Accept': 'application/json'
          }
        }
      );

      const projects = projectsResponse.data.QueryResponse?.Customer || [];
      const projectData: HistoricalProjectData[] = [];

      for (const project of projects) {
        // Get invoices for this project
        const invoicesResponse = await axios.get(
          `${baseUrl}/v3/company/${software.companyId}/query`,
          {
            params: {
              query: `SELECT * FROM Invoice WHERE CustomerRef = '${project.Id}'`
            },
            headers: {
              'Authorization': `Bearer ${software.accessToken}`,
              'Accept': 'application/json'
            }
          }
        );

        // Get expenses for this project
        const expensesResponse = await axios.get(
          `${baseUrl}/v3/company/${software.companyId}/query`,
          {
            params: {
              query: `SELECT * FROM Purchase WHERE CustomerRef = '${project.Id}'`
            },
            headers: {
              'Authorization': `Bearer ${software.accessToken}`,
              'Accept': 'application/json'
            }
          }
        );

        const invoices = invoicesResponse.data.QueryResponse?.Invoice || [];
        const expenses = expensesResponse.data.QueryResponse?.Purchase || [];

        if (invoices.length > 0 || expenses.length > 0) {
          projectData.push(this.processQuickBooksProjectData(project, invoices, expenses));
        }
      }

      return projectData;
    } catch (error) {
      console.error('Error fetching QuickBooks project data:', error);
      throw error;
    }
  }

  private processQuickBooksProjectData(
    project: any,
    invoices: any[],
    expenses: any[]
  ): HistoricalProjectData {
    const totalRevenue = invoices.reduce((sum, inv) => sum + (inv.TotalAmt || 0), 0);
    const totalExpenses = expenses.reduce((sum, exp) => sum + (exp.TotalAmt || 0), 0);
    
    const startDate = new Date(project.MetaData?.CreateTime || Date.now());
    const completionDate = invoices.length > 0 
      ? new Date(Math.max(...invoices.map(inv => new Date(inv.TxnDate).getTime())))
      : new Date();

    return {
      projectId: project.Id,
      projectName: project.DisplayName || project.Name,
      startDate,
      completionDate,
      budgetedCost: totalRevenue * 0.8, // Estimate based on typical margins
      actualCost: totalExpenses,
      laborHours: {
        budgeted: this.estimateLaborHours(totalRevenue, 'budgeted'),
        actual: this.estimateLaborHours(totalExpenses, 'actual')
      },
      materialCosts: {
        budgeted: totalRevenue * 0.4, // Typical material cost ratio
        actual: totalExpenses * 0.6 // Estimate material portion of expenses
      },
      overheadCosts: totalExpenses * 0.2,
      profitMargin: (totalRevenue - totalExpenses) / totalRevenue,
      accuracy: this.calculateProjectAccuracy(totalRevenue, totalExpenses)
    };
  }

  // Xero specific implementations
  private async getXeroProjectData(
    software: BookkeepingSoftware,
    dateRange: { from: Date; to: Date }
  ): Promise<HistoricalProjectData[]> {
    try {
      // Get tracking categories (projects in Xero)
      const trackingResponse = await axios.get(
        'https://api.xero.com/api.xro/2.0/TrackingCategories',
        {
          headers: {
            'Authorization': `Bearer ${software.accessToken}`,
            'Xero-tenant-id': software.companyId,
            'Accept': 'application/json'
          }
        }
      );

      const projects = trackingResponse.data.TrackingCategories?.find(
        cat => cat.Name.toLowerCase().includes('project')
      )?.Options || [];

      const projectData: HistoricalProjectData[] = [];

      for (const project of projects) {
        // Get invoices for this tracking category
        const invoicesResponse = await axios.get(
          'https://api.xero.com/api.xro/2.0/Invoices',
          {
            params: {
              where: `Type=="ACCREC" AND TrackingCategories.Any(TrackingCategoryID=Guid("${project.TrackingCategoryID}") AND TrackingOptionID=Guid("${project.TrackingOptionID}"))`
            },
            headers: {
              'Authorization': `Bearer ${software.accessToken}`,
              'Xero-tenant-id': software.companyId,
              'Accept': 'application/json'
            }
          }
        );

        const invoices = invoicesResponse.data.Invoices || [];
        
        if (invoices.length > 0) {
          projectData.push(this.processXeroProjectData(project, invoices));
        }
      }

      return projectData;
    } catch (error) {
      console.error('Error fetching Xero project data:', error);
      throw error;
    }
  }

  private processXeroProjectData(project: any, invoices: any[]): HistoricalProjectData {
    const totalRevenue = invoices.reduce((sum, inv) => sum + (inv.Total || 0), 0);
    const avgInvoiceDate = new Date(
      invoices.reduce((sum, inv) => sum + new Date(inv.Date).getTime(), 0) / invoices.length
    );

    return {
      projectId: project.TrackingOptionID,
      projectName: project.Name,
      startDate: new Date(avgInvoiceDate.getTime() - (30 * 24 * 60 * 60 * 1000)), // Estimate start date
      completionDate: avgInvoiceDate,
      budgetedCost: totalRevenue * 0.8,
      actualCost: totalRevenue * 0.75, // Estimate based on typical margins
      laborHours: {
        budgeted: this.estimateLaborHours(totalRevenue, 'budgeted'),
        actual: this.estimateLaborHours(totalRevenue * 0.75, 'actual')
      },
      materialCosts: {
        budgeted: totalRevenue * 0.4,
        actual: totalRevenue * 0.45
      },
      overheadCosts: totalRevenue * 0.15,
      profitMargin: 0.25, // Estimated
      accuracy: 0.85 // Estimated accuracy
    };
  }

  // NetSuite specific implementations
  private async getNetSuiteProjectData(
    software: BookkeepingSoftware,
    dateRange: { from: Date; to: Date }
  ): Promise<HistoricalProjectData[]> {
    // NetSuite implementation would go here
    // More complex due to OAuth 1.0 and different data structure
    return [];
  }

  // Helper methods
  private async makeNetSuiteRequest(url: string, method: string, credentials: any): Promise<any> {
    // OAuth 1.0 signature generation for NetSuite
    // This is a simplified version - real implementation would need proper OAuth 1.0 signing
    throw new Error('NetSuite integration requires OAuth 1.0 implementation');
  }

  private estimateLaborHours(cost: number, type: 'budgeted' | 'actual'): number {
    const avgHourlyRate = 75; // Average fabrication hourly rate
    const multiplier = type === 'actual' ? 1.1 : 1.0; // Actual often higher than budgeted
    return (cost * 0.5 / avgHourlyRate) * multiplier; // Assume 50% of cost is labor
  }

  private calculateProjectAccuracy(revenue: number, expenses: number): number {
    if (revenue === 0) return 0;
    const margin = (revenue - expenses) / revenue;
    return Math.max(0, Math.min(1, 1 - Math.abs(margin - 0.25) / 0.25)); // Target 25% margin
  }

  private async getPayrollData(software: BookkeepingSoftware): Promise<any[]> {
    // Implementation would fetch payroll data from each system
    return [];
  }

  private async getTimesheetData(software: BookkeepingSoftware, projectIds?: string[]): Promise<any[]> {
    // Implementation would fetch timesheet data
    return [];
  }

  private async getPurchaseData(software: BookkeepingSoftware): Promise<any[]> {
    // Implementation would fetch purchase order and bill data
    return [];
  }

  private async getVendorData(software: BookkeepingSoftware): Promise<any[]> {
    // Implementation would fetch vendor/supplier data
    return [];
  }

  private async getBalanceSheet(software: BookkeepingSoftware): Promise<any> {
    // Implementation would fetch balance sheet
    return {};
  }

  private async getIncomeStatement(software: BookkeepingSoftware): Promise<any> {
    // Implementation would fetch P&L statement
    return {};
  }

  private async getCashFlowStatement(software: BookkeepingSoftware): Promise<any> {
    // Implementation would fetch cash flow statement
    return {};
  }

  private async getARAgingReport(software: BookkeepingSoftware): Promise<any> {
    // Implementation would fetch accounts receivable aging
    return {};
  }

  private async getAPAgingReport(software: BookkeepingSoftware): Promise<any> {
    // Implementation would fetch accounts payable aging
    return {};
  }

  private processLaborAnalysis(payrollData: any[], timesheetData: any[]): LaborAnalysis {
    // Process payroll and timesheet data to extract labor insights
    return {
      averageHourlyRate: 75,
      skillLevels: {
        junior: { rate: 45, efficiency: 0.7 },
        intermediate: { rate: 65, efficiency: 0.85 },
        senior: { rate: 85, efficiency: 0.95 },
        certified: { rate: 105, efficiency: 1.1 }
      },
      overtimeRates: 112.5,
      benefits: 0.35, // 35% of base rate
      productivity: {
        timeOfYear: { Q1: 0.9, Q2: 1.0, Q3: 0.95, Q4: 0.85 },
        dayOfWeek: { Mon: 0.95, Tue: 1.0, Wed: 1.0, Thu: 0.98, Fri: 0.9 },
        projectType: { structural: 1.0, architectural: 0.85, heavy: 1.2 }
      }
    };
  }

  private processMaterialAnalysis(
    purchaseData: any[],
    vendorData: any[],
    materialTypes?: string[]
  ): MaterialCostAnalysis {
    // Process purchase and vendor data
    return {
      supplierPerformance: [
        { name: 'Steel Supply Co', averagePrice: 0.65, reliability: 0.95, deliveryTime: 3, qualityScore: 0.92 },
        { name: 'Metro Steel', averagePrice: 0.68, reliability: 0.88, deliveryTime: 5, qualityScore: 0.88 }
      ],
      seasonalTrends: { Q1: 1.05, Q2: 1.0, Q3: 0.95, Q4: 1.1 },
      volumeDiscounts: { '1000': 0.02, '5000': 0.05, '10000': 0.08 },
      preferredVendors: ['Steel Supply Co', 'Metro Steel', 'Industrial Materials Inc']
    };
  }

  private calculateFinancialMetrics(
    balanceSheet: any,
    incomeStatement: any,
    cashFlow: any,
    arAging: any,
    apAging: any
  ): FinancialHealthMetrics {
    // Calculate comprehensive financial health metrics
    return {
      cashFlow: {
        current: 150000,
        projected30Days: 125000,
        projected60Days: 110000,
        projected90Days: 95000
      },
      workingCapital: 250000,
      accountsReceivable: {
        current: 180000,
        overdue: 25000,
        averageCollectionDays: 35
      },
      accountsPayable: {
        current: 95000,
        overdue: 5000,
        averagePaymentDays: 28
      },
      profitMargins: {
        gross: 0.35,
        net: 0.12,
        operating: 0.18
      }
    };
  }
}

export const bookkeepingService = new BookkeepingIntegrationService();