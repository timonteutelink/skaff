import type {
	TemplateDTO,
} from "@timonteutelink/skaff-lib";

/* =============================================================================
	 Tree Node Types

	 Four kinds of nodes:
		• instantiated – an already created template instance.
		• subCategory – groups a given sub template category.
		• childTemplate – represents a candidate child template (from the parent's subTemplates).
		• createInstance – an action node to instantiate a new instance of that child template.
------------------------------------------------------------------------------- */
export type ProjectTreeNode =
	| InstantiatedNode
	| SubCategoryNode
	| ChildTemplateNode
	| CreateInstanceNode;

export interface InstantiatedNode {
	type: "instantiated";
	id: string;
	name: string;
	instanceData: {
		templateSettings: any; // Replace with proper type
	};
	children?: ProjectTreeNode[];
}

export interface SubCategoryNode {
	type: "subCategory";
	id: string;
	name: string; // category name (e.g. "Components", "Pages", etc.)
	children: ProjectTreeNode[];
}

export interface ChildTemplateNode {
	type: "childTemplate";
	id: string;
	templateDefinition: TemplateDTO;
	children: ProjectTreeNode[];
}

export interface CreateInstanceNode {
	type: "createInstance";
	id: string;
	parentId: string;
	candidateTemplate: TemplateDTO;
}
