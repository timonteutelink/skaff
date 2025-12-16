{ mkBunDerivation
, pkgs
, lib
, # Optional list of Skaff plugins to install at build time
  # Example: plugins = [ "@skaff/plugin-greeter@1.0.0" "@myorg/my-plugin" ]
  plugins ? [ ]
,
}:

let
  # Convert plugin list to space-separated string for environment variable
  pluginList = lib.concatStringsSep " " plugins;
  hasPlugins = plugins != [ ];
in

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

    ${lib.optionalString hasPlugins ''
      # Install plugins specified via Nix
      echo "Installing Skaff plugins: ${pluginList}"
      for plugin in ${pluginList}; do
        echo "  Installing: $plugin"
        bun add "$plugin" --no-save
      done
      echo "Plugin installation complete"

      # Set environment variable for plugin registry generation
      export SKAFF_PLUGINS="${pluginList}"
    ''}

    bun run build

    cd ../..

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p $out/share/app $out/bin

    cd apps/web

    cp -r .next/standalone/apps/web/* $out/share/app/
    cp -r .next/standalone/apps/web/.next $out/share/app/.next

    cp -r .next/standalone/node_modules $out/share/app/node_modules

    rm -rf $out/share/app/node_modules/typescript
    ln -s ${pkgs.nodePackages.typescript}/lib/node_modules/typescript \
      $out/share/app/node_modules/typescript

    if [ -f .next/standalone/package.json ]; then
      cp .next/standalone/package.json $out/share/app/package.json
    fi

    cp -r public $out/share/app/public
    mkdir -p $out/share/app/.next
    cp -r .next/static $out/share/app/.next/static

    cd ../..

    makeWrapper ${pkgs.nodejs_22}/bin/node $out/bin/skaff-web \
      --add-flags "$out/share/app/server.js" \
      --set-default HOSTNAME 0.0.0.0 \
      --set-default PORT 3000 \
      --set NODE_ENV production \
      --set NODE_PATH "$out/share/app/node_modules" \
      --set-default NEXT_CACHE_DIR /var/cache/skaff-web

    runHook postInstall
  '';

  doDist = false;

  # Expose plugin configuration for introspection
  passthru = {
    inherit plugins;
    hasPlugins = hasPlugins;
  };

  meta = with lib; {
    description = "Skaff web interface - template scaffolding tool"
      + lib.optionalString hasPlugins " (with ${toString (builtins.length plugins)} plugin(s))";
    license = licenses.mit;
    platforms = platforms.unix;
    mainProgram = "skaff-web";
  };
}

