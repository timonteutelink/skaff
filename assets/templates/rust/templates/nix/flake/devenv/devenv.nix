localFlake:
{ lib, config, self, inputs, ... }: {
  perSystem = { system, ... }: {
    devenv.shells.default = {
      packages = [ ];

      name = "Timon Software Templator";

      languages = { };

      pre-commit = {
        settings = { };
        hooks = { nixpkgs-fmt.enable = true; };
      };

      enterShell = ''
        echo 'Biep Boop'
      '';
    };
  };
}
