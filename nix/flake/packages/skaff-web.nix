localFlake:
{ lib, config, self, inputs, ... }: {
  perSystem = { pkgs, system, ... }:
    {
      packages.skaff-web = pkgs.callPackage ./../../skaff-package/web-package.nix {
        inherit (inputs.bun2nix.lib.${system}) mkBunDerivation;
      };
    };

}

