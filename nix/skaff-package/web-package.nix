{ mkBunDerivation, pkgs, lib }:

mkBunDerivation {
  pname = "skaff-web";
  version = "0.0.1";

  src = ./../../apps/web;
  bunNix = ./bun-packages.nix;
  workspaceRoot = ./../..;

  buildPhase = ''
    bun run build
  '';

  postBuild = ''
    sed -i '1s|^|#!/usr/bin/env bun\n|' .next/standalone/server.js
    patchShebangs .next/standalone/server.js
  '';

  installPhase = ''
    mkdir -p $out/{share/app,bin}

    # Copy standalone output and static assets
    cp -r .next/standalone $out/share/app/
    cp -r public $out/share/app/public
    mkdir -p $out/share/app/.next
    cp -r .next/static $out/share/app/.next/static

    # Symlink a cache dir for Next.js
    ln -s /var/cache/skaff-web $out/share/app/.next/cache

    # Make the server entrypoint executable
    chmod +x $out/share/app/server.js

    # Wrap the server to set defaults and environment
    makeWrapper $out/share/app/server.js $out/bin/skaff-web \
      --set HOSTNAME 0.0.0.0 \
      --set PORT 3000 \
      --set NODE_ENV production
  '';

  doDist = false;

  meta = with lib; {
    description = "Next.js web application for Code Templator packaged with Bun";
    license = licenses.mit;
    platforms = platforms.unix;
    mainProgram = "skaff-web";
  };
}

