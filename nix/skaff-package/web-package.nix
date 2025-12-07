{ bun2nix, pkgs, lib }:
bun2nix.mkDerivation {
  pname = "skaff-web";
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

  buildPhase = ''
    runHook preBuild

    export NEXT_TELEMETRY_DISABLED=1
    export CI=1

    cd apps/web

    bun run build

    cd ../..

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p $out/share $out/bin

    cd apps/web

    # Copy the entire standalone output preserving its structure
    # The standalone output has symlinks that reference paths relative to this structure
    cp -r .next/standalone/* $out/share/

    # Copy static assets
    cp -r public $out/share/apps/web/public
    mkdir -p $out/share/apps/web/.next
    cp -r .next/static $out/share/apps/web/.next/static

    # Symlink typescript for runtime usage
    # Remove the .bun typescript directory and all symlinks pointing to it
    rm -rf $out/share/node_modules/.bun/typescript@*
    rm -rf $out/share/node_modules/.bun/node_modules/typescript
    rm -rf $out/share/node_modules/typescript
    rm -rf $out/share/apps/web/node_modules/typescript
    
    # Create symlinks to Nix typescript package
    ln -s ${pkgs.nodePackages.typescript}/lib/node_modules/typescript \
      $out/share/node_modules/typescript
    ln -s ${pkgs.nodePackages.typescript}/lib/node_modules/typescript \
      $out/share/apps/web/node_modules/typescript

    cd ../..

    makeWrapper ${pkgs.nodejs_22}/bin/node $out/bin/skaff-web \
      --add-flags "$out/share/apps/web/server.js" \
      --set-default HOSTNAME 0.0.0.0 \
      --set-default PORT 3000 \
      --set NODE_ENV production \
      --set NODE_PATH "$out/share/node_modules" \
      --set-default NEXT_CACHE_DIR /var/cache/skaff-web

    runHook postInstall
  '';

  doDist = false;

  meta = with lib; {
    description = "Next.js web application for skaffolding tool packaged with Bun";
    license = licenses.mit;
    platforms = platforms.unix;
    mainProgram = "skaff-web";
  };
}

