localFlake:
{ lib, config, self, inputs, ... }: {
  perSystem = { pkgs, system, ... }:
    let
      cliSrc = ./../../../apps/cli;
    in
    {
      packages.code-templator-cli = pkgs.denoPlatform.mkDenoBinary {
        name = "code-templator";
        version = "0.0.1";
        src = cliSrc;
        buildInputs = [ ];

        additionalDenoArgs = [
          "--cached-only"
          "--unstable-sloppy-imports"
        ];

        entrypoint = "./src/main.ts";

        permissions.allow.all = true;

        env = { };

        meta = with lib; {
          description = "A CLI tool to template software projects.";
          license = licenses.mit;
          platforms = platforms.unix;
        };
      };
    };
}

