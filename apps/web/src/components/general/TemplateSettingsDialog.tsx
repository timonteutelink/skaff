import { PropsWithChildren, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { UserTemplateSettings } from "@timonteutelink/template-types-lib";

interface TemplateSettingsDialogProps {
	projectName: string;
	selectedTemplate: string;
	selectedTemplateSettingsSchema: object;

	action: (userSettings: UserTemplateSettings) => Promise<void>;
	cancel: () => void;
}

export const TemplateSettingsDialog: React.FC<PropsWithChildren<TemplateSettingsDialogProps>> = ({ children, projectName, selectedTemplate, selectedTemplateSettingsSchema, action, cancel }) => {
	const [open, setOpen] = useState(false);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild disabled={!projectName || !selectedTemplate}>
				{children}
			</DialogTrigger>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>Fill in all settings for template {selectedTemplate} in project {projectName}</DialogTitle>
					<DialogDescription>Very nice</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4 py-4">
				</div>

			</DialogContent>
		</Dialog>
	);
}
