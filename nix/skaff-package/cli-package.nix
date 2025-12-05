{ bun2nix, pkgs }:
bun2nix.mkDerivation {
  pname = "skaff";
  version = "0.0.1";

  src = ./../..;
  bunDeps = bun2nix.fetchBunDeps {
    bunNix = ./bun-packages.nix;
  };

  nativeBuildInputs = with pkgs; [
    makeWrapper
    nodejs_22
    bun
    rsync
  ];

  # workspaceRoot = ./../..;
  # passthru.workspaces = {
  #   "@timonteutelink/skaff-lib" = ./../../packages/skaff-lib;
  #   "@repo/eslint-config" = ./../../packages/eslint-config;
  #   "@repo/typescript-config" = ./../../packages/typescript-config;
  #   "@repo/tailwind-config" = ./../../packages/tailwind-config;
  # };

  buildPhase = ''
    runHook preBuild
    # bun install --no-progress --frozen-lockfile
    cd apps/cli
    bun run build:dist
    cd ../..
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
    mkdir -p $out/lib/skaff $out/bin

    cd apps/cli

    cp -r dist bin package.json oclif.manifest.json ../../node_modules $out/lib/skaff

    makeWrapper ${pkgs.nodejs_22}/bin/node $out/bin/skaff \
      --add-flags "$out/lib/skaff/bin/run.js" \
      --set NODE_ENV production \
      --set NODE_PATH "$out/lib/skaff/node_modules"

    runHook postInstall
  '';
}
