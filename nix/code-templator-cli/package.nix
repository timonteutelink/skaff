{ mkBunDerivation
,
}: mkBunDerivation {
  pname = "code-templator-cli";
  version = "0.0.1";

  src = ./../../apps/cli;
  bunNix = ./bun-packages.nix;

  workspaceRoot = ./../..;
  passthru.workspaces = {
    "@repo/code-templator-lib" = ./../../packages/code-templator-lib;
    "@repo/eslint-config" = ./../../packages/eslint-config;
    "@repo/typescript-config" = ./../../packages/typescript-config;
    "@repo/tailwind-config" = ./../../packages/tailwind-config;
  };

  buildPhase = ''
    bun run buildprod
  '';

  installPhase = ''
    mkdir -p $out/bin
    cp dist/app $out/bin/
    chmod +x $out/bin/app
  '';
}
