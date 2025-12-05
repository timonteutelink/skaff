localFlake:
{ lib, config, self, inputs, ... }: {
  perSystem = { pkgs, system, ... }:
    {
      packages = {
        skaff-cli = pkgs.callPackage ./../../skaff-package/cli-package.nix {
          bun2nix = inputs.bun2nix.packages.${system}.default;
        };
        default = self.packages.${system}.skaff-cli;
      };
    };

}

