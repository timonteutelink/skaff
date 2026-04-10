localFlake:
{ lib, config, self, inputs, ... }: {
  perSystem = { pkgs, system, ... }:
    {
      packages.skaff-web = pkgs.callPackage ./../../skaff-package/web-package.nix {
        bun2nix = inputs.bun2nix.packages.${system}.default;
      };
    };

}

