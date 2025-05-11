localFlake:
{ lib, config, self, inputs, ... }: {
  perSystem = { pkgs, system, ... }:
    let
    in
    {
      packages.code-templator-cli = pkgs.denoPlatform.mkDenoBinary {
        name = "code-templator";
        version = "0.0.1";
        src = ./../../../apps/cli;
        buildInputs = [ ];

        importMap = ./../../../apps/cli/import_map.json;
        lockFile = ./../../../apps/cli/deno.lock;

        entrypoint = "./src/main.ts";

        permissions.allow.all = true;

        env = {
          DENO_NO_PACKAGE_JSON = "1";
        };

        meta = with lib; {
          description = "A CLI tool to template software projects.";
          license = licenses.mit;
          platforms = platforms.unix;
        };
      };
    };
}

