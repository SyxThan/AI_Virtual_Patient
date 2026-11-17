# Avatar asset contract: `mother_child.glb` (Slice 16)

Trạng thái: **draft v2** (cảnh hoạt hình phòng khám). Bản dựng tham chiếu nằm trong `assets/avatar/` và qua hết `validate_avatar.mjs`.
Cảnh: mẹ ngồi ở mép giường khám, bế bé trên đùi trái, trong một phòng khám nhi của bệnh viện.
Mục đích: team Blender và team web làm song song. Code chỉ được dựa vào những gì ghi trong file này.

## 1. File

| Mục | Quy định |
|---|---|
| Tên file | `mother_child.glb` (một file duy nhất, glTF 2.0 binary) |
| Nén | `KHR_draco_mesh_compression` |
| Dung lượng | **< 5 MB** sau khi nén Draco (bản tham chiếu: ~300 KB, ~31k tam giác, 29 material) |
| Texture | Không nhúng texture lâm sàng. Texture tổn thương được nạp lúc chạy (xem §6) |
| Animation | Không bắt buộc. Chuyển động (thở, chớp mắt, quay đầu) do code điều khiển |

## 2. Hệ toạ độ

- Đơn vị **mét** (scale 1.0). Tỉ lệ chibi: mẹ đang ngồi, đỉnh đầu cao khoảng 1.6 m. Phòng rộng khoảng 4.2 × 3.6 m, chỉ có tường sau và tường trái (diorama mở về phía camera).
- Gốc toạ độ `(0,0,0)` nằm **giữa hai bàn chân mẹ**, trên mặt sàn (Y = 0 là sàn).
- Trục **+Y hướng lên**, nhân vật **quay mặt về +Z** (về phía người học hoặc camera).
  Trong Blender (Z-up) nghĩa là nhân vật nhìn về **−Y** và bật `+Y Up` khi export.
- Bên trái của nhân vật (`_L`) là **+X**.
- Bé ngồi trên đùi trái của mẹ, giơ hai tay, lòng bàn tay hướng về +Z.

## 3. Mẹ

### 3.1 Morph target (shape key)

| Tên | Ý nghĩa | 0 → 1 |
|---|---|---|
| `jawOpen` | Há miệng, dùng cho lip-sync | ngậm → há hết cỡ |
| `eyeBlink_L` | Nhắm mắt trái (của nhân vật) | mở → nhắm |
| `eyeBlink_R` | Nhắm mắt phải | mở → nhắm |

- Tên phải viết **đúng chữ hoa và chữ thường** như trên. Có thể thêm morph khác, code sẽ bỏ qua.
- Mặc định `mesh.weights` phải bằng **0** (mặt ở trạng thái trung tính). Trong Blender, `value` của mọi shape key phải về 0 trước khi export, vì exporter ghi giá trị hiện tại vào file.
- Cả ba morph nằm trên **cùng một mesh**: `Mother_Head`.
- ⚠️ GLTFLoader tách một mesh nhiều vật liệu thành **nhiều `THREE.Mesh`** (mỗi primitive một mesh), và mỗi mesh có `morphTargetInfluences` riêng.
  `LipSyncController` và phần chớp mắt phải ghi influence cho **mọi** mesh có `morphTargetDictionary.jawOpen`, không chỉ mesh đầu tiên tìm thấy.

### 3.2 Xương

- Armature là node **`Mother`** (mang `label` của nhóm). Nó có bone tên **`head`**, là joint của skin (`THREE.Bone`). Chuỗi bone: `root → spine → neck → head`.
- Pivot của `head` đặt ở cổ (gốc của bone). Code xoay `head` để mẹ nhìn về phía người học (giới hạn yaw ±40°, pitch −17°…+20°).
- `Mother_Head` (có morph) và `Mother_Hair` được **gắn cứng vào bone `head`** (bone parent, không skin), để morph không phải chạy qua skinning.
- `Mother_Torso` (skin theo `spine`) phải là **node gốc** (không nằm dưới node armature). Nếu không, Khronos validator báo `NODE_SKINNED_MESH_NON_ROOT`.
- Bone `spine` (nếu có) dùng cho nhịp thở (scale rất nhỏ). Bone này không bắt buộc.

## 4. Collider (vùng khám)

| Node | `regionId` | Vùng |
|---|---|---|
| `collider_palm_hands` | `palm_hands` | Lòng bàn tay (cả hai tay) |
| `collider_feet` | `feet` | Bàn chân (cả hai chân) |
| `collider_mouth_throat` | `mouth_throat` | Quanh miệng, họng |
| `collider_buttocks_knees` | `buttocks_knees` | Mông, đầu gối |

- Tên node và mesh có dạng `collider_<regionId>`, trong đó `regionId` trùng với id vùng trong case JSON.
- Ghi thêm `extras.regionId` (custom property `regionId` trong Blender, bật *Include → Custom Properties* khi export). Code ưu tiên đọc `extras`, nếu không có thì cắt tên node.
- Collider là hình hộp hoặc capsule low-poly, mỗi collider **dưới 200 tam giác**, và có thể gồm nhiều mảnh (ví dụ hai bàn tay).
- Collider vẫn có trong file nhưng **code sẽ ẩn đi** (`visible = false`). Raycast vẫn trúng mesh đang ẩn.
- Collider phải bao kín vùng da tương ứng, chỉ chồng lấn tối thiểu sang vùng khác (cho phép lấn một chút ở cổ tay và cổ chân).
- Code còn dùng hộp bao của collider để giới hạn vùng hiện texture tổn thương (§6), nên collider không được to quá vùng cần khám.

## 5. Bé: vật liệu da và UV

- Toàn bộ da hở của bé dùng **một material duy nhất tên `child_skin`**, chia trên nhiều mesh (`Child_Head`, `Child_Arm*`, `Child_Hand*`, `Child_Leg*`, `Child_Foot*`). Code tìm theo `material.name === 'child_skin'`. Quần áo, tóc, mắt và miệng dùng material khác.
- `child_skin` có `TEXCOORD_0` nằm trong khoảng [0,1] và chia theo **atlas 3 × 2**. Toạ độ dưới đây tính theo UV của glTF/three.js, gốc ở góc **trên bên trái**:

| Ô (u, v) | Vùng | Phần mesh |
|---|---|---|
| u 0–⅓, v 0–½ | `palm_hands` | bàn tay |
| u ⅓–⅔, v 0–½ | `feet` | bàn chân |
| u ⅔–1, v 0–½ | `mouth_throat` | đầu, mặt, cổ |
| u 0–⅓, v ½–1 | `buttocks_knees` | chân, đầu gối |
| u ⅓–⅔, v ½–1 | (trống) | để dành |
| u ⅔–1, v ½–1 | khác | cánh tay |

  Trong Blender, trục V ngược chiều (gốc ở dưới bên trái), nên hàng trên của bảng nằm ở `v 0.5–1` trong Blender.
- Hai tay và hai chân được phép **dùng chung UV** (chồng lên nhau trong cùng ô), nên một texture sẽ áp cho cả hai bên.
- Vùng mông bị quần che trong bản tham chiếu, nên texture chỉ hiện được ở đầu gối. `TODO(clinician)`: có cần cảnh khám mông (cởi quần) không?

## 6. Texture tổn thương (S16-04)

- Model **không chứa dữ liệu lâm sàng**. Mô tả tổn thương luôn lấy từ case JSON.
- Lớp tổn thương chỉ hiện ở vùng **đã được khám**. Đề xuất cách làm:
  `onBeforeCompile` trên `child_skin`, với cờ cho từng vùng và hộp bao của collider để cắt vùng hiện.
  Bản xem trước đang dùng hoa văn procedural để minh hoạ.
- Mỗi texture hoặc hoa văn đều gắn nhãn **"Minh hoạ, chờ bác sĩ duyệt"** và `origin: author_added`.
- `TODO(clinician)`: ảnh và texture tổn thương thật (ban, bóng nước) do bác sĩ quyết định. File texture đặt theo ô atlas ở §5, kích thước gợi ý 1024 × 512.

## 7. Bộ phận tương tác (label / info)

Mỗi bộ phận click được là **một mesh riêng**, tên `PascalCase_Part`, không dấu, không trùng. Text hiển thị nằm trong custom property `label` và `info` (glTF `extras`, three.js đọc qua `object.userData`). Click vào mesh con thì code dò ngược lên node cha gần nhất có `label`.

| Nhóm | Node |
|---|---|
| `Mother` (armature) | `Mother_Head`, `Mother_Hair`, `Mother_Torso`, `Mother_ArmL`, `Mother_ArmR`, `Mother_Legs`, `Mother_Shoes` |
| `Child` (empty) | `Child_Head`, `Child_Hair`, `Child_Torso`, `Child_Shorts`, `Child_ArmL/R`, `Child_HandL/R`, `Child_LegL/R`, `Child_FootL/R` |
| `Room` (empty) | `Floor`, `Wall_Back`, `Wall_Left`, `Window`, `Exam_Bed`, `Step_Stool`, `Doctor_Stool`, `Desk`, `Computer`, `Cabinet`, `Trash_Bin`, `Height_Chart`, `Poster`, `Wall_Clock`, `IV_Stand`, `Monitor`, `Curtain`, `Teddy` |

- GLTFLoader biến mesh nhiều vật liệu thành một `Group` chứa nhiều `Mesh`; `label` nằm trên `Group`.
- Muốn highlight riêng từng bộ phận thì code phải `material.clone()` cho từng mesh, vì file dùng chung material theo màu.
- Vật liệu `screen_line`, `display`, `glass` có emissive. Nhấp nháy màn hình làm ở phía web, file không có animation vật liệu.
- Ánh sáng làm ở phía web (Hemisphere + Directional ấm từ phía cửa sổ). File không chứa đèn hay camera.
- Nội dung `info` hiện là text minh hoạ do tác giả viết, không phải dữ liệu lâm sàng.

## 8. Kiểm tra trước khi giao file

```bash
npx gltf-transform draco mother_child_raw.glb mother_child.glb --quantize-position 14
node validate_avatar.mjs mother_child.glb     # phải ra 28/28 PASS
```

`validate_avatar.mjs` kiểm tra: dung lượng, Khronos validator không có lỗi, Draco, đủ 40 bộ phận có `label`/`info`, tên node không trùng,
ngân sách (< 50k tam giác, < 30 material), 3 morph mặc định bằng 0, bone `head`, 4 collider, đơn vị và gốc toạ độ, hướng +Z, `child_skin` và UV atlas, không có texture nhúng.

Ghi chú khi export từ Blender: bản Blender cài qua pip (`bpy`) **không có thư viện Draco**, nên dùng `gltf-transform draco` như trên.
Bản Blender desktop có thể bật Draco ngay trong exporter, nhưng vẫn phải chạy validator.

## 9. Phương án dự phòng

- Không tải được `mother_child.glb` (lỗi mạng hoặc file không đạt contract): `ModelLoader` quay về **model procedural** hiện tại, đảm bảo đủ 4 collider cùng tên.
- Không có WebGL: hiện màn dự phòng với danh sách 4 vùng khám, và vẫn khám được bằng click vào danh sách.

---

# Contract `avp-case-scene/1`: mô hình 3D cho các ca khác HFMD (AVP-160)

Phần trên (Slice 16) chỉ áp dụng cho ca `case-01-hfmd` với `mother_child.glb`; ca này giữ nguyên 4 vùng, `observe_child` và model procedural dự phòng.
Mọi ca khác có `catalog.exam_mode = "3d"` dùng contract dưới đây. Bản đầy đủ cho người dựng model nằm trong `docs/specs/avatar-asset.md` của từng gói asset; code web chỉ dựa vào những mục sau.

## A. File trong `apps/web/public/models/`

| File | Nội dung |
|---|---|
| `<caseId>.glb` | glTF 2.0 binary, Draco, cùng hệ toạ độ và phòng với Slice 16 |
| `<caseId>.scene.json` | Cấu hình cảnh. **Không** chứa finding, nhãn vùng, phương pháp khám hay chữ lâm sàng |

```json
{ "contract": "avp-case-scene/1", "caseId": "case-02-dengue", "model": "/models/case-02-dengue.glb",
  "speakerLabel": "Mẹ", "draft": true,
  "camera": { "home": {"pos":[x,y,z],"target":[x,y,z]}, "exam": {"pos":[...],"target":[...]} },
  "breathing": { "morph": "breathIn", "rate": 52, "amplitude": 1.0 },
  "regions": [ { "id": "<collider regionId>", "overlays": [ { "type": "petechiae", "p1": 190, "p2": 0.16, "color": "#8e1b2c", "strength": 1 } ] } ] }
```

- `contract` và `caseId` phải khớp ca đang mở; `model` phải là đường dẫn cục bộ `/models/*.glb`. Sai thì sân khấu chỉ còn thanh nút khám.
- `breathing` chỉ có khi gói có (ví dụ viêm phổi); code chỉ đọc `morph`, `rate` (0 < rate ≤ 120 lần/phút), `amplitude` (0..1). Trường khác (như `note`) không bao giờ hiển thị.
- `regions[].overlays`: copy nguyên văn từ `demo/case.json` của gói. Kiểu: `petechiae`, `vesicles`, `focus`, `edge`, `tint` (bảng tham số ở §6 của gói). `focus`/`edge` cần `landmark` có trong model, thiếu thì bỏ qua.
- `speakerLabel` dùng cho nhãn "<speakerLabel> đang nói"; trống thì lấy vai người trả lời của ca.

## B. Catalog của ca (GET /cases/{id})

- `exam_mode: "3d"`.
- `exam_regions[]`: trước hết một mục cho mỗi collider (`id` = `regionId` của collider, `label`, `exam_region` → `exam[].region` của ca, `x`/`y` null), sau đó các mục **không** có collider (ví dụ `general`, `vitals`): chỉ là nút trên thanh khám.
- Nhãn hiển thị lấy từ catalog. Collider có `regionId` không nằm trong catalog thì bị bỏ qua (không click được).

## C. Model (`gltf.scene.userData` và node extras)

- Scene extras: `contract`, `caseId`, `regions` (thứ tự vùng, tối đa 8), `skinMaterial` (mặc định `patient_skin`).
- Người nói: node có `extras.role = "speaker"` và `extras.faceForward`; bone `head` (và `spine` nếu có) nằm dưới node đó. Đầu xoay tối đa 35° quanh `faceForward`, dùng được cho người ngồi lẫn người nằm.
- Morph `jawOpen`, `eyeBlink_L`, `eyeBlink_R` ghi cho **mọi** mesh có morph đó. Morph thở lấy tên từ `breathing.morph`.
- Collider `collider_<id>` với extras `regionId`, `atlasCell` (0–5, `-1` = trên quần áo), `boxes` (AABB thế giới), `viewDir` (hướng camera khi bay tới vùng). Vùng trên quần áo hover thì hiện collider mờ màu vàng.
- Empty `landmark_<tên>` với `extras.landmark`: vị trí cho lớp `focus`/`edge`.
- Bộ phận có `extras.label` hiện tooltip; `extras.info` là ghi chú tác giả, **không** hiển thị.

## D. An toàn (Hard Rule 1)

- Finding chỉ đến từ `POST /sessions/{id}/actions` (nguyên văn `exam[]` của ca). Web không đọc finding từ scene.json hay gói asset.
- Lớp minh hoạ (overlay) chỉ hiện ở vùng **đã khám và có finding được ghi nhận** (`documented = true`); vùng không có ghi nhận không vẽ gì. Nhãn luôn hiện: "Dấu hiệu trên mô hình chỉ là hình minh hoạ, chờ bác sĩ duyệt".

## E. Dự phòng

- Thiếu `scene.json`, thiếu GLB, sai contract/caseId, hoặc thiếu người nói/bone `head`/morph `jawOpen`/vật liệu da/collider hợp lệ: không có model procedural, sân khấu hiện thông báo và thanh nút khám (mọi vùng của catalog vẫn khám được).
- Không có WebGL: như Slice 16, chỉ còn thanh nút khám.
- Trang Setup kiểm WebGL và tải trước đúng model của ca (đọc `scene.json` để biết `model`).

Code: `components/avatar/caseScene.ts` (helper thuần, có test), `caseSceneLoader.ts`, `caseRig.ts`, `caseSkin.ts`.
