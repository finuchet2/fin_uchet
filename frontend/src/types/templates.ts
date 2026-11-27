export type IndustryTemplateId = "pvz" | "marketplace_seller" | "universal_business"

export type ProjectCategoryType = "INCOME" | "EXPENSE" | "TAX"

export type ProjectCategoryTab = "expenses" | "income" | "taxes"

export interface ProjectTemplateCategory {
  name: string
  type: ProjectCategoryType
}

export interface IndustryProjectTemplate {
  id: IndustryTemplateId
  name: string
  shortDescription: string
  applicationArea: string
  defaultProjectPlaceholder: string
  defaultDescriptionPlaceholder: string
  accentColor: string
  categories: {
    income: ProjectTemplateCategory[]
    expenses: ProjectTemplateCategory[]
    taxes: ProjectTemplateCategory[]
  }
}

export interface ProjectCategoryItem {
  id: string
  name: string
  type?: ProjectCategoryType
  system: boolean
  active: boolean
}

export type ProjectCategoryBuckets = Record<ProjectCategoryTab, ProjectCategoryItem[]>

export function buildProjectCategoriesFromTemplate(
  projectId: string,
  template: IndustryProjectTemplate,
): ProjectCategoryBuckets {
  return {
    income: template.categories.income.map((item, index) => ({
      id: `${projectId}-${template.id}-inc-${index + 1}`,
      name: item.name,
      type: item.type,
      system: false,
      active: true,
    })),
    expenses: template.categories.expenses.map((item, index) => ({
      id: `${projectId}-${template.id}-exp-${index + 1}`,
      name: item.name,
      type: item.type,
      system: false,
      active: true,
    })),
    taxes: template.categories.taxes.map((item, index) => ({
      id: `${projectId}-${template.id}-tax-${index + 1}`,
      name: item.name,
      type: item.type,
      system: false,
      active: true,
    })),
  }
}

export function buildEmptyProjectCategories(): ProjectCategoryBuckets {
  return {
    expenses: [],
    income: [],
    taxes: [],
  }
}

export function countProjectCategories(categories?: ProjectCategoryBuckets): number {
  if (!categories) return 0
  return categories.income.length + categories.expenses.length + categories.taxes.length
}
