#!/usr/bin/env bash

cd "$(dirname "$0")/.." || exit 1

set -e

PATCH_CONTENT='
diff --git a/apps/cli/package.json b/apps/cli/package.json
index 514abfd..c203aaa 100644
--- a/apps/cli/package.json
+++ b/apps/cli/package.json
@@ -18,8 +18,8 @@
     "@oclif/core": "^4.5.3",
     "@oclif/plugin-help": "^6.2.32",
     "@oclif/plugin-plugins": "^5.4.46",
-    "@timonteutelink/skaff-lib": "0.0.69",
-    "@timonteutelink/template-types-lib": "0.0.47",
+    "@timonteutelink/skaff-lib": "workspace:*",
+    "@timonteutelink/template-types-lib": "workspace:*",
     "esbuild": "^0.25.9",
     "loglevel": "^1.9.2",
     "winston": "^3.17.0",
diff --git a/apps/web/package.json b/apps/web/package.json
index 51a5052..d9f5497 100644
--- a/apps/web/package.json
+++ b/apps/web/package.json
@@ -39,8 +39,8 @@
     "@radix-ui/react-toggle-group": "^1.1.11",
     "@radix-ui/react-tooltip": "^1.2.8",
     "@tailwindcss/postcss": "^4.1.13",
-    "@timonteutelink/skaff-lib": "0.0.69",
-    "@timonteutelink/template-types-lib": "0.0.47",
+    "@timonteutelink/skaff-lib": "workspace:*",
+    "@timonteutelink/template-types-lib": "workspace:*",
     "class-variance-authority": "^0.7.1",
     "clsx": "^2.1.1",
     "cmdk": "^1.1.1",
diff --git a/package.json b/package.json
index d6b67bc..3e3a5b8 100644
--- a/package.json
+++ b/package.json
@@ -22,7 +22,9 @@
     "apps/cli",
     "packages/typescript-config",
     "packages/eslint-config",
-    "packages/tailwind-config"
+    "packages/tailwind-config",
+    "packages/skaff-lib",
+    "packages/template-types-lib"
   ],
   "resolutions": {
     "react": "19.1.0",
diff --git a/packages/skaff-lib/package.json b/packages/skaff-lib/package.json
index 648a279..e469b22 100644
--- a/packages/skaff-lib/package.json
+++ b/packages/skaff-lib/package.json
@@ -32,7 +32,7 @@
     "@types/node": "^22.18.0",
     "@langchain/langgraph": "^0.3.12",
     "@langchain/openai": "^0.5.18",
-    "@timonteutelink/template-types-lib": "0.0.47",
+    "@timonteutelink/template-types-lib": "workspace:*",
     "esbuild": "^0.25.9",
     "fs-extra": "^11.3.1",
     "glob": "^11.0.3",
'

usage() {
    echo "Usage: $0 [enable|disable]"
    exit 1
}

if [ $# -ne 1 ]; then
    usage
fi

case "$1" in
    enable)
        echo "Applying patch..."
        echo "$PATCH_CONTENT" | git apply
        ;;
    disable)
        echo "Reverting patch..."
        echo "$PATCH_CONTENT" | git apply -R
        ;;
    *)
        usage
        ;;
esac


