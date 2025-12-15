"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Settings, Trash2, Save, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  retrieveAllPluginSettings,
  savePluginSettings,
  removePluginSettings,
} from "@/app/actions/plugin-settings";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";

/**
 * Form schema for adding/editing plugin settings.
 */
const pluginSettingsFormSchema = z.object({
  pluginName: z
    .string()
    .min(1, "Plugin name is required")
    .regex(
      /^[a-zA-Z0-9-_.:@/]+$/,
      "Plugin name can only contain alphanumeric characters, dashes, underscores, dots, colons, @ and /",
    ),
  settings: z.string().refine(
    (val) => {
      try {
        JSON.parse(val);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Settings must be valid JSON" },
  ),
});

type PluginSettingsFormValues = z.infer<typeof pluginSettingsFormSchema>;

interface PluginSettingsEntry {
  name: string;
  settings: unknown;
}

export default function SettingsPage() {
  const [pluginSettings, setPluginSettings] = useState<PluginSettingsEntry[]>(
    [],
  );
  const [isLoading, setIsLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingPlugin, setEditingPlugin] = useState<string | null>(null);

  const addForm = useForm<PluginSettingsFormValues>({
    resolver: zodResolver(pluginSettingsFormSchema),
    defaultValues: {
      pluginName: "",
      settings: "{}",
    },
  });

  const editForm = useForm<PluginSettingsFormValues>({
    resolver: zodResolver(pluginSettingsFormSchema),
    defaultValues: {
      pluginName: "",
      settings: "{}",
    },
  });

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    const result = await retrieveAllPluginSettings();

    if ("error" in result) {
      toast.error("Failed to load plugin settings", {
        description: result.error,
      });
      setIsLoading(false);
      return;
    }

    const entries: PluginSettingsEntry[] = Object.entries(
      result.data ?? {},
    ).map(([name, settings]) => ({ name, settings }));
    setPluginSettings(entries);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleAddPlugin = useCallback(
    async (values: PluginSettingsFormValues) => {
      const result = await savePluginSettings(
        values.pluginName,
        JSON.parse(values.settings),
      );

      if ("error" in result) {
        toast.error("Failed to save plugin settings", {
          description: result.error,
        });
        return;
      }

      toast.success("Plugin settings saved", {
        description: `Settings for ${values.pluginName} have been saved.`,
      });

      setAddDialogOpen(false);
      addForm.reset();
      loadSettings();
    },
    [addForm, loadSettings],
  );

  const handleEditPlugin = useCallback(
    async (values: PluginSettingsFormValues) => {
      const result = await savePluginSettings(
        values.pluginName,
        JSON.parse(values.settings),
      );

      if ("error" in result) {
        toast.error("Failed to save plugin settings", {
          description: result.error,
        });
        return;
      }

      toast.success("Plugin settings updated", {
        description: `Settings for ${values.pluginName} have been updated.`,
      });

      setEditingPlugin(null);
      loadSettings();
    },
    [loadSettings],
  );

  const handleRemovePlugin = useCallback(
    async (pluginName: string) => {
      const result = await removePluginSettings(pluginName);

      if ("error" in result) {
        toast.error("Failed to remove plugin settings", {
          description: result.error,
        });
        return;
      }

      toast.success("Plugin settings removed", {
        description: `Settings for ${pluginName} have been removed.`,
      });

      loadSettings();
    },
    [loadSettings],
  );

  const openEditDialog = useCallback(
    (entry: PluginSettingsEntry) => {
      editForm.reset({
        pluginName: entry.name,
        settings: JSON.stringify(entry.settings, null, 2),
      });
      setEditingPlugin(entry.name);
    },
    [editForm],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="h-6 w-6" />
            Plugin Settings
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure system-wide settings for installed plugins.
          </p>
        </div>

        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Add Plugin Settings
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Add Plugin Settings</DialogTitle>
              <DialogDescription>
                Configure system settings for a plugin. These settings are
                available to the plugin across all projects.
              </DialogDescription>
            </DialogHeader>

            <Form {...addForm}>
              <form
                onSubmit={addForm.handleSubmit(handleAddPlugin)}
                className="space-y-4 py-4"
              >
                <FormField
                  control={addForm.control}
                  name="pluginName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Plugin Name</FormLabel>
                      <FormControl>
                        <Input placeholder="@skaff/plugin-greeter" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={addForm.control}
                  name="settings"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Settings (JSON)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder='{ "key": "value" }'
                          className="font-mono text-sm min-h-[150px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button type="submit" className="gap-2">
                    <Save className="h-4 w-4" />
                    Save Settings
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading plugin settings...</p>
        </div>
      ) : pluginSettings.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Settings className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">
              No plugin settings configured
            </h3>
            <p className="text-muted-foreground mb-4">
              Plugin settings allow you to configure system-wide options for
              installed plugins.
            </p>
            <Button
              variant="outline"
              onClick={() => setAddDialogOpen(true)}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Add your first plugin settings
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {pluginSettings.map((entry) => (
            <Card key={entry.name}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="truncate" title={entry.name}>
                    {entry.name}
                  </span>
                  <Badge variant="secondary">Plugin</Badge>
                </CardTitle>
                <CardDescription>
                  System settings for this plugin
                </CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="bg-muted p-3 rounded-md text-xs overflow-auto max-h-[150px]">
                  {JSON.stringify(entry.settings, null, 2)}
                </pre>
              </CardContent>
              <CardFooter className="flex justify-end gap-2">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1">
                      <Trash2 className="h-3 w-3" />
                      Remove
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Remove plugin settings?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This will remove all system settings for the plugin
                        &quot;{entry.name}&quot;. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleRemovePlugin(entry.name)}
                      >
                        Remove
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <Dialog
                  open={editingPlugin === entry.name}
                  onOpenChange={(open) => !open && setEditingPlugin(null)}
                >
                  <DialogTrigger asChild>
                    <Button
                      variant="default"
                      size="sm"
                      className="gap-1"
                      onClick={() => openEditDialog(entry)}
                    >
                      <Settings className="h-3 w-3" />
                      Edit
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                      <DialogTitle>Edit Plugin Settings</DialogTitle>
                      <DialogDescription>
                        Update system settings for {entry.name}.
                      </DialogDescription>
                    </DialogHeader>

                    <Form {...editForm}>
                      <form
                        onSubmit={editForm.handleSubmit(handleEditPlugin)}
                        className="space-y-4 py-4"
                      >
                        <FormField
                          control={editForm.control}
                          name="pluginName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Plugin Name</FormLabel>
                              <FormControl>
                                <Input {...field} disabled />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={editForm.control}
                          name="settings"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Settings (JSON)</FormLabel>
                              <FormControl>
                                <Textarea
                                  className="font-mono text-sm min-h-[150px]"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <DialogFooter>
                          <Button type="submit" className="gap-2">
                            <Save className="h-4 w-4" />
                            Save Changes
                          </Button>
                        </DialogFooter>
                      </form>
                    </Form>
                  </DialogContent>
                </Dialog>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>About Plugin Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            Plugin settings are stored in your Skaff configuration file and are
            available to plugins across all projects. Each plugin can define its
            own settings schema.
          </p>
          <p>
            To configure a plugin, you need to know its exact name (as specified
            in the plugin&apos;s manifest) and the settings schema it expects.
            Refer to the plugin&apos;s documentation for details.
          </p>
          <p>
            <strong>Settings file location:</strong>{" "}
            <code className="bg-muted px-1 py-0.5 rounded">
              ~/.config/skaff/settings.json
            </code>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
