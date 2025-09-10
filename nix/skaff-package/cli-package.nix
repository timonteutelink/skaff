{ mkBunDerivation
,
}: mkBunDerivation {
  pname = "skaff";
  version = "0.0.1";

  src = ./../../apps/cli;
  bunNix = ./bun-packages.nix;

  workspaceRoot = ./../..;
  # passthru.workspaces = {
  #   "@timonteutelink/skaff-lib" = ./../../packages/skaff-lib;
  #   "@repo/eslint-config" = ./../../packages/eslint-config;
  #   "@repo/typescript-config" = ./../../packages/typescript-config;
  #   "@repo/tailwind-config" = ./../../packages/tailwind-config;
  # };

  buildPhase = ''
    bun run pack:here
  '';

  installPhase = ''
    mkdir -p $out/bin
    cp ./tmp/skaff/bin/skaff $out/bin/
    chmod +x $out/bin/skaff
  '';
}
