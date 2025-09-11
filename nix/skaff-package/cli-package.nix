{ mkBunDerivation
,
}: mkBunDerivation {
  pname = "skaff";
  version = "0.0.1";

  src = ./../..;
  bunNix = ./bun-packages.nix;

  # workspaceRoot = ./../..;
  # passthru.workspaces = {
  #   "@timonteutelink/skaff-lib" = ./../../packages/skaff-lib;
  #   "@repo/eslint-config" = ./../../packages/eslint-config;
  #   "@repo/typescript-config" = ./../../packages/typescript-config;
  #   "@repo/tailwind-config" = ./../../packages/tailwind-config;
  # };

  buildPhase = ''
    cd apps/cli
    bun run pack:here
    cd ../..
  '';

  installPhase = ''
    mkdir -p $out/bin
    ls -la
    cp ./tmp/skaff/bin/skaff $out/bin/
    chmod +x $out/bin/skaff
  '';
}
