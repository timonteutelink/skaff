{ mkBunDerivation, pkgs, lib }:

mkBunDerivation {
  pname = "skaff-web";
  version = "0.0.1";

  src = ./../..;
  bunNix = ./bun-packages.nix;

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

    mkdir -p $out/share/app $out/bin

    cd apps/web

    cp -r .next/standalone/* $out/share/app/
    cp -r public $out/share/app/public
    mkdir -p $out/share/app/.next
    cp -r .next/static $out/share/app/.next/static

    cd ../..

    makeWrapper ${pkgs.nodejs_22}/bin/node $out/bin/skaff-web \
      --add-flags "$out/share/app/server.js" \
      --set-default HOSTNAME 0.0.0.0 \
      --set-default PORT 3000 \
      --set NODE_ENV production \
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

