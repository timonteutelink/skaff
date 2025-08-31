{ mkBunDerivation
,
}: mkBunDerivation {
  pname = "code-templator";
  version = "0.0.1";

  src = ./../../apps/cli;
  bunNix = ./bun-packages.nix;

  workspaceRoot = ./../..;
  # passthru.workspaces = {
  #   "@timonteutelink/code-templator-lib" = ./../../packages/code-templator-lib;
  #   "@repo/eslint-config" = ./../../packages/eslint-config;
  #   "@repo/typescript-config" = ./../../packages/typescript-config;
  #   "@repo/tailwind-config" = ./../../packages/tailwind-config;
  # };

  buildPhase = ''
    bun run pack:here
  '';

  installPhase = ''
    mkdir -p $out/bin
    cp ./tmp/code-templator/bin/code-templator $out/bin/
    chmod +x $out/bin/code-templator
  '';
}
