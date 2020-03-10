import Node from "../elements/Node"
import Mesh from "../elements/Mesh"
import Primitive from "../elements/Primitive"
import GLState from 'nanogl-state/state'
import GLConfig from 'nanogl-state/config'
import Camera from 'nanogl-camera'
import Material from "../elements/Material"

export default class MeshRenderer {

  node: Node;
  mesh: Mesh;

  glconfig? : GLConfig;

  constructor(node: Node) {
    this.node = node;
    this.mesh = node.mesh;
  }


  render( glstate: GLState, camera: Camera, mask: number = ~0, glconfig?: GLConfig ){

    const primitives = this.mesh.primitives;
    

    for (let i = 0; i < primitives.length; i++) {

      const primitive = primitives[i];
      const mat:Material = primitive.material;

      // mat.prepare(this.node, camera, primitive)

      // push configs
      // -------------

      mat.glconfig && glstate.push(mat.glconfig);
      this.glconfig && glstate.push(this.glconfig);
      glconfig && glstate.push(glconfig);

      glstate.apply()

      // render
      // ----------
      // this.drawCall(camera, mat.prg, primitive, mat);

      // pop configs
      // -------------

      mat.glconfig && glstate.pop();
      this.glconfig && glstate.pop();
      glconfig && glstate.pop();

    }

  }
  drawCall(camera: Camera, prg: any, primitive: Primitive, mat: Material) {
    
  }

}