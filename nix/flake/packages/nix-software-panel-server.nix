localFlake:
{ lib, config, self, inputs, ... }: {
  perSystem = { pkgs, system, ... }:
    let
      banana = "banana";

      defaultHostname = "0.0.0.0";
      defaultPort = 3000;
    in
    {
      packages.nix-software-panel-server = pkgs.buildNpmPackage {
        pname = "nix-software-panel-server";
        version = "0.0.1";
        src = ./../../..;

        npmDepsHash = "sha256-QMZuqg6VX9LdbjPo9X2Kmi7EP05YS4gG6HUXQtkfo9I=";

        buildInputs = [ pkgs.timon-nix-json-ast pkgs.timon-scripts.install-system pkgs.timon-scripts.add-system pkgs.timon-scripts.install-remote-system ];

        env = {
          NEXT_PUBLIC_TIMON_MOD_PATH = banana;
        };
        preBuild = ''
          echo "NEXT_PUBLIC_TIMON_MOD_PATH=${banana}" >> .env
        '';

        postBuild = ''
          # Add a shebang to the server js file, then patch the shebang to use a nixpkgs nodejs binary.
          sed -i '1s|^|#!/usr/bin/env node\n|' .next/standalone/server.js
          patchShebangs .next/standalone/server.js
        '';

        installPhase = ''
          runHook preInstall

          mkdir -p $out/{share,bin}

          cp -r .next/standalone $out/share/app/
          cp -r .env $out/share/app/
          cp -r public $out/share/app/public

          mkdir -p $out/share/app/.next
          cp -r .next/static $out/share/app/.next/static

          # https://github.com/vercel/next.js/discussions/58864
          ln -s /var/cache/nix-software-panel-server $out/share/app/.next/cache
          # also provide a environment variable to override the cache directory
          substituteInPlace $out/share/app/node_modules/next/dist/server/image-optimizer.js \
              --replace '_path.join)(distDir,' '_path.join)(process.env["NEXT_CACHE_DIR"] || distDir,'

          chmod +x $out/share/app/server.js

          # we set a default port to support "nix run ..."
          makeWrapper $out/share/app/server.js $out/bin/nix-software-panel-server \
            --set-default PORT ${toString defaultPort} \
            --set-default HOSTNAME ${defaultHostname} \
            --set NODE_ENV production \
            --set NEXT_PUBLIC_TIMON_MOD_PATH ${banana}

          runHook postInstall
        '';

        doDist = false;

        meta = with lib; {
          description = "Nix Software Panel Server";
          license = licenses.mit;
          platforms = platforms.unix;
          mainProgram = "nix-software-panel-server";
        };
      };
    };
}
